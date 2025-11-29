extern crate alloc;

use alloc::boxed::Box;
use alloc::format;
use alloc::rc::Rc;
use alloc::string::String;
use core::cell::RefCell;
use hashbrown::HashMap;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::DedicatedWorkerGlobalScope;
use web_sys::{MessageEvent, MessagePort};

type ChannelResolver = Box<dyn FnOnce(PluginChannel)>;

pub struct PluginChannelStatic {
    pending_acquires: HashMap<String, ChannelResolver>,
    available_channels: HashMap<String, MessagePort>,
}

impl PluginChannelStatic {
    fn new() -> Self {
        Self {
            pending_acquires: HashMap::new(),
            available_channels: HashMap::new(),
        }
    }
}

thread_local! {
    static PLUGIN_CHANNEL_STATE: Rc<RefCell<PluginChannelStatic>> = {
        let state = Rc::new(RefCell::new(PluginChannelStatic::new()));
        initialize_listener(state.clone());
        state
    };
}

fn get_state() -> Rc<RefCell<PluginChannelStatic>> {
    PLUGIN_CHANNEL_STATE.with(|state| state.clone())
}

fn initialize_listener(state: Rc<RefCell<PluginChannelStatic>>) {
    // Set up message event listener
    let closure = Closure::wrap(Box::new(move |event: MessageEvent| {
        handle_message(event, state.clone());
    }) as Box<dyn FnMut(MessageEvent)>);

    if let Some(window) = web_sys::window() {
        // Request plugin channels from parent
        if let Some(parent) = window.parent().ok().flatten() {
            let _ = parent.post_message(&JsValue::from_str("request_plugin_channels"), "*");
        }

        window
            .add_event_listener_with_callback("message", closure.as_ref().unchecked_ref())
            .expect("failed to add event listener");
    } else if let Ok(worker) = js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>() {
        let _ = worker.post_message(&JsValue::from_str("request_plugin_channels"));

        worker
            .add_event_listener_with_callback("message", closure.as_ref().unchecked_ref())
            .expect("Failed to add listener");
    }

    closure.forget(); // Keep the closure alive
}

fn handle_message(event: MessageEvent, state: Rc<RefCell<PluginChannelStatic>>) {
    let data = event.data();

    // Check if this is a plugin_channel_created event
    if let Ok(obj) = data.dyn_into::<js_sys::Object>() {
        let type_val = js_sys::Reflect::get(&obj, &JsValue::from_str("type")).ok();

        if let Some(type_str) = type_val.and_then(|v| v.as_string()) {
            if type_str == "plugin_channel_created" {
                let channel_obj = js_sys::Reflect::get(&obj, &JsValue::from_str("channel")).ok();

                if let Some(channel) = channel_obj {
                    let name = js_sys::Reflect::get(&channel, &JsValue::from_str("name"))
                        .ok()
                        .and_then(|v| v.as_string());
                    let version = js_sys::Reflect::get(&channel, &JsValue::from_str("version"))
                        .ok()
                        .and_then(|v| v.as_string());

                    let ports = event.ports();
                    let port = if ports.length() > 0 {
                        ports.get(0).dyn_into::<MessagePort>().ok()
                    } else {
                        None
                    };

                    if let (Some(name), Some(version), Some(port)) = (name, version, port) {
                        let key = format!("{}:{}", name, version);
                        let mut state_mut = state.borrow_mut();

                        // Check for pending acquire request
                        if let Some(resolver) = state_mut.pending_acquires.remove(&key) {
                            drop(state_mut); // Drop the borrow before calling resolver
                            let channel = PluginChannel::new(port);
                            resolver(channel);
                        } else {
                            // Store for later
                            state_mut.available_channels.insert(key, port);
                        }
                    }
                }
            }
        }
    }
}

pub struct PluginChannel {
    port: MessagePort,
}

impl PluginChannel {
    fn new(port: MessagePort) -> Self {
        Self { port }
    }

    pub async fn acquire(name: &str, version: &str) -> Result<Self, JsValue> {
        let key = format!("{}:{}", name, version);
        let state = get_state();

        // Check if channel is already available
        {
            let mut state_mut = state.borrow_mut();
            if let Some(port) = state_mut.available_channels.remove(&key) {
                return Ok(Self::new(port));
            }
        }

        // Create a JS Promise
        let promise = js_sys::Promise::new(&mut |resolve, _reject| {
            let resolver = Box::new(move |channel: PluginChannel| {
                let _ = resolve.call1(&JsValue::NULL, &JsValue::from(channel));
            });

            state
                .borrow_mut()
                .pending_acquires
                .insert(key.clone(), resolver);
        });

        // Await the promise
        let result = JsFuture::from(promise).await?;

        // Extract the MessagePort from the resolved value
        let obj = result.dyn_into::<js_sys::Object>()?;
        let port =
            js_sys::Reflect::get(&obj, &JsValue::from_str("port"))?.dyn_into::<MessagePort>()?;

        Ok(Self::new(port))
    }

    pub fn get_port(&self) -> &MessagePort {
        &self.port
    }
}

// Implement conversion to JsValue for Promise resolution
impl From<PluginChannel> for JsValue {
    fn from(channel: PluginChannel) -> Self {
        // Create a JS object to wrap the channel
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("port"),
            &JsValue::from(channel.port),
        )
        .unwrap();
        obj.into()
    }
}
