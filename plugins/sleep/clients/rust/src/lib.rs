use std::{cell::RefCell, rc::Rc};

use js_sys::Reflect;
use rcade_sdk::channel::PluginChannel;
use wasm_bindgen::{JsCast, JsValue, prelude::Closure};
use web_sys::MessageEvent;

/// Sleep and screensaver management.
pub struct Sleep {
    channel: PluginChannel,
    screensaver_started_handler: RefCell<Option<Box<dyn FnMut()>>>,
    screensaver_stopped_handler: RefCell<Option<Box<dyn FnMut()>>>,
}

impl Sleep {
    pub async fn acquire() -> Result<Rc<Self>, JsValue> {
        let channel = PluginChannel::acquire("@rcade/sleep", "1.0.0").await?;

        channel.get_port().start();

        let rc = Rc::new(Self {
            channel,
            screensaver_started_handler: RefCell::new(None),
            screensaver_stopped_handler: RefCell::new(None),
        });

        let handler_rc = rc.clone();
        let handler = Closure::wrap(Box::new(move |value: &MessageEvent| {
            let data = value.data();
            let ty = Reflect::get(&data, &JsValue::from_str("type")).unwrap();
            let string = ty.as_string().unwrap();
            match string.as_str() {
                "screensaver_started" => {
                    if let Some(handler) =
                        handler_rc.screensaver_started_handler.borrow_mut().as_mut()
                    {
                        handler();
                    }
                }
                "screensaver_stopped" => {
                    if let Some(handler) =
                        handler_rc.screensaver_stopped_handler.borrow_mut().as_mut()
                    {
                        handler();
                    }
                }
                _ => {}
            }
        }) as Box<dyn FnMut(&MessageEvent)>);
        rc.channel
            .get_port()
            .add_event_listener_with_callback("message", handler.as_ref().unchecked_ref())
            .unwrap();
        handler.forget();

        Ok(rc)
    }

    pub fn prevent_sleep(&self) {
        let message = js_sys::Object::new();
        Reflect::set(
            &message,
            &JsValue::from_str("type"),
            &JsValue::from_str("prevent_sleep"),
        )
        .unwrap();
        self.channel.get_port().post_message(&message).unwrap();
    }

    pub fn update_screensaver_config(&self, config: ScreensaverConfig) {
        let message = js_sys::Object::new();
        Reflect::set(
            &message,
            &JsValue::from_str("type"),
            &JsValue::from_str("update_screensaver"),
        )
        .unwrap();
        let config_object = js_sys::Object::new();
        if let Some(transparent) = config.transparent {
            Reflect::set(
                &config_object,
                &JsValue::from_str("transparent"),
                &JsValue::from_bool(transparent),
            )
            .unwrap();
        }
        if let Some(visible) = config.visible {
            Reflect::set(
                &config_object,
                &JsValue::from_str("visible"),
                &JsValue::from_bool(visible),
            )
            .unwrap();
        }
        Reflect::set(
            &message,
            &JsValue::from_str("config"),
            &JsValue::from(config_object),
        )
        .unwrap();
        self.channel.get_port().post_message(&message).unwrap();
    }

    pub fn set_screensaver_started_handler<F: FnMut() + 'static>(&self, callback: F) {
        let _ = self
            .screensaver_started_handler
            .borrow_mut()
            .insert(Box::new(callback));
    }

    pub fn set_screensaver_stopped_handler<F: FnMut() + 'static>(&self, callback: F) {
        let _ = self
            .screensaver_stopped_handler
            .borrow_mut()
            .insert(Box::new(callback));
    }
}

#[derive(Default)]
pub struct ScreensaverConfig {
    transparent: Option<bool>,
    visible: Option<bool>,
}

impl ScreensaverConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_transparent(mut self, value: bool) -> ScreensaverConfig {
        self.transparent.replace(value);

        self
    }

    pub fn with_visible(mut self, value: bool) -> ScreensaverConfig {
        self.visible.replace(value);

        self
    }
}
