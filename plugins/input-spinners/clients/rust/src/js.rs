//! The browser side: the plugin channel's port and the command timers.
//! Messages cross as JSON (`JSON.parse`/`JSON.stringify`), so what's sent is
//! exactly what serde_json makes of the `Wire*` types.

use rcade_sdk::channel::PluginChannel;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{MessageEvent, MessagePort};

use crate::spinner::{dispatch, opened, timed_out};
use crate::wire::{Player, WireCommand, WireMessage};

/// How long a command may wait for the knob before it fails.
const COMMAND_TIMEOUT_MS: i32 = 2_000;

#[wasm_bindgen]
extern "C" {
    // Globals in both windows and workers. The player and id are passed on
    // to the handler, so one handler serves every timer.
    #[wasm_bindgen(js_name = setTimeout)]
    fn set_timeout(handler: &js_sys::Function, ms: i32, player: u32, id: f64) -> JsValue;
    #[wasm_bindgen(js_name = clearTimeout)]
    fn clear_timeout(handle: &JsValue);
}

/// A command's 2 s; cleared when dropped.
pub(crate) struct Timer(JsValue);

impl Drop for Timer {
    fn drop(&mut self) {
        clear_timeout(&self.0);
    }
}

#[derive(Default)]
pub(crate) struct Channel {
    acquiring: bool,
    port: Option<MessagePort>,
    on_message: Option<Closure<dyn FnMut(MessageEvent)>>,
    on_timeout: Option<Closure<dyn FnMut(u32, f64)>>,
}

impl Channel {
    /// Acquire the channel, once. Outside the cabinet this never finishes.
    pub(crate) fn start(&mut self) {
        if self.acquiring {
            return;
        }
        self.acquiring = true;
        wasm_bindgen_futures::spawn_local(async {
            match PluginChannel::acquire("@rcade/input-spinners", "^2.0.0").await {
                Ok(channel) => opened(channel.get_port().clone()),
                Err(error) => web_sys::console::error_2(&"[input-spinners]".into(), &error),
            }
        });
    }

    pub(crate) fn open(&mut self, port: MessagePort) {
        let on_message = Closure::<dyn FnMut(MessageEvent)>::new(|event: MessageEvent| {
            let Ok(json) = js_sys::JSON::stringify(&event.data()) else { return };
            let Some(json) = json.as_string() else { return };
            // Messages this version doesn't understand are ignored.
            if let Ok(message) = serde_json::from_str::<WireMessage>(&json) {
                dispatch(message);
            }
        });
        port.set_onmessage(Some(on_message.as_ref().unchecked_ref()));
        port.start();
        self.on_message = Some(on_message);
        self.port = Some(port);
    }

    pub(crate) fn post(&self, command: &WireCommand) {
        let Some(port) = &self.port else { return };
        let Ok(json) = serde_json::to_string(command) else { return };
        if let Ok(value) = js_sys::JSON::parse(&json)
            && let Err(error) = port.post_message(&value)
        {
            web_sys::console::error_2(&"[input-spinners]".into(), &error);
        }
    }

    pub(crate) fn timer(&mut self, player: Player, id: u64) -> Timer {
        let handler = self.on_timeout.get_or_insert_with(|| {
            Closure::<dyn FnMut(u32, f64)>::new(|player: u32, id: f64| {
                let player = if player == 2 { Player::Two } else { Player::One };
                timed_out(player, id as u64);
            })
        });
        Timer(set_timeout(handler.as_ref().unchecked_ref(), COMMAND_TIMEOUT_MS, player as u32, id as f64))
    }
}
