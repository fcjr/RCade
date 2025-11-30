extern crate alloc;

use alloc::boxed::Box;
use alloc::format;
use alloc::rc::Rc;
use alloc::string::String;
use core::cell::RefCell;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::DedicatedWorkerGlobalScope;
use web_sys::{MessageEvent, MessagePort};

fn generate_nonce() -> String {
    use js_sys::Math;
    format!(
        "{}{}",
        (Math::random() * 1e15) as u64,
        (Math::random() * 1e15) as u64
    )
}

pub struct PluginChannel {
    port: MessagePort,
}

impl PluginChannel {
    fn new(port: MessagePort) -> Self {
        Self { port }
    }

    pub async fn acquire(name: &str, version: &str) -> Result<Self, JsValue> {
        let nonce = generate_nonce();

        // Create a JS Promise
        let promise = js_sys::Promise::new(&mut |resolve, reject| {
            let nonce_for_closure = nonce.clone();

            // Store the closure in an Rc<RefCell> so we can reference it from within
            let closure_holder: Rc<RefCell<Option<Closure<dyn FnMut(MessageEvent)>>>> =
                Rc::new(RefCell::new(None));
            let closure_holder_clone = closure_holder.clone();

            // Create a closure that will handle the message
            let closure = Closure::wrap(Box::new(move |event: MessageEvent| {
                let data = event.data();

                // Check if this is a plugin_channel event with matching nonce
                if let Ok(obj) = data.dyn_into::<js_sys::Object>() {
                    let type_val = js_sys::Reflect::get(&obj, &JsValue::from_str("type")).ok();
                    let nonce_val = js_sys::Reflect::get(&obj, &JsValue::from_str("nonce")).ok();

                    if let (Some(type_str), Some(recv_nonce)) = (
                        type_val.and_then(|v| v.as_string()),
                        nonce_val.and_then(|v| v.as_string()),
                    ) {
                        if type_str == "plugin_channel" && recv_nonce == nonce_for_closure {
                            let ports = event.ports();
                            let port = if ports.length() > 0 {
                                ports.get(0).dyn_into::<MessagePort>().ok()
                            } else {
                                None
                            };

                            // Check for error response
                            if let Ok(error_val) =
                                js_sys::Reflect::get(&obj, &JsValue::from_str("error"))
                            {
                                if !error_val.is_undefined() {
                                    // Remove the event listener
                                    if let Some(closure_ref) =
                                        closure_holder_clone.borrow().as_ref()
                                    {
                                        let target = event.target();
                                        if let Some(window) = target
                                            .clone()
                                            .and_then(|t| t.dyn_into::<web_sys::Window>().ok())
                                        {
                                            let _ = window.remove_event_listener_with_callback(
                                                "message",
                                                closure_ref.as_ref().unchecked_ref(),
                                            );
                                        } else if let Some(worker) = target.and_then(|t| {
                                            t.dyn_into::<DedicatedWorkerGlobalScope>().ok()
                                        }) {
                                            let _ = worker.remove_event_listener_with_callback(
                                                "message",
                                                closure_ref.as_ref().unchecked_ref(),
                                            );
                                        }
                                    }

                                    // Reject with the error
                                    let error_msg = error_val
                                        .as_string()
                                        .unwrap_or_else(|| "Unknown error".to_string());
                                    let _ = reject
                                        .call1(&JsValue::NULL, &JsValue::from_str(&error_msg));
                                    return;
                                }
                            }

                            let channel_obj =
                                js_sys::Reflect::get(&obj, &JsValue::from_str("channel")).ok();

                            if let Some(channel) = channel_obj {
                                let name =
                                    js_sys::Reflect::get(&channel, &JsValue::from_str("name"))
                                        .ok()
                                        .and_then(|v| v.as_string());
                                let version =
                                    js_sys::Reflect::get(&channel, &JsValue::from_str("version"))
                                        .ok()
                                        .and_then(|v| v.as_string());

                                if let (Some(_name), Some(_version), Some(port)) =
                                    (name, version, port)
                                {
                                    // Remove the event listener
                                    if let Some(closure_ref) =
                                        closure_holder_clone.borrow().as_ref()
                                    {
                                        let target = event.target();
                                        if let Some(window) = target
                                            .clone()
                                            .and_then(|t| t.dyn_into::<web_sys::Window>().ok())
                                        {
                                            let _ = window.remove_event_listener_with_callback(
                                                "message",
                                                closure_ref.as_ref().unchecked_ref(),
                                            );
                                        } else if let Some(worker) = target.and_then(|t| {
                                            t.dyn_into::<DedicatedWorkerGlobalScope>().ok()
                                        }) {
                                            let _ = worker.remove_event_listener_with_callback(
                                                "message",
                                                closure_ref.as_ref().unchecked_ref(),
                                            );
                                        }
                                    }

                                    // Resolve with the channel
                                    let channel = PluginChannel::new(port);
                                    let _ = resolve.call1(&JsValue::NULL, &JsValue::from(channel));
                                }
                            }
                        }
                    }
                }
            }) as Box<dyn FnMut(MessageEvent)>);

            // Register the listener
            if let Some(window) = web_sys::window() {
                window
                    .add_event_listener_with_callback("message", closure.as_ref().unchecked_ref())
                    .expect("failed to add event listener");
            } else if let Ok(worker) = js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>() {
                worker
                    .add_event_listener_with_callback("message", closure.as_ref().unchecked_ref())
                    .expect("Failed to add listener");
            }

            // Store the closure so it can reference itself for removal
            *closure_holder.borrow_mut() = Some(closure);

            // Leak the closure holder so it stays alive
            let _ = Rc::into_raw(closure_holder);

            // Send the acquire message
            let message = js_sys::Object::new();
            js_sys::Reflect::set(
                &message,
                &JsValue::from_str("type"),
                &JsValue::from_str("acquire_plugin_channel"),
            )
            .unwrap();
            js_sys::Reflect::set(
                &message,
                &JsValue::from_str("nonce"),
                &JsValue::from_str(&nonce),
            )
            .unwrap();

            let channel_obj = js_sys::Object::new();
            js_sys::Reflect::set(
                &channel_obj,
                &JsValue::from_str("name"),
                &JsValue::from_str(name),
            )
            .unwrap();
            js_sys::Reflect::set(
                &channel_obj,
                &JsValue::from_str("version"),
                &JsValue::from_str(version),
            )
            .unwrap();
            js_sys::Reflect::set(&message, &JsValue::from_str("channel"), &channel_obj).unwrap();

            if let Some(window) = web_sys::window() {
                if let Some(parent) = window.parent().ok().flatten() {
                    let _ = parent.post_message(&message, "*");
                }
            } else if let Ok(worker) = js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>() {
                let _ = worker.post_message(&message);
            }
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
