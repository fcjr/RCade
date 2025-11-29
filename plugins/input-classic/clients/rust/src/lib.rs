pub mod state;

use rcade_sdk::{channel::PluginChannel, shmem_runner::PluginSharedMemoryRunner};
use wasm_bindgen::JsValue;

use crate::state::ControllerState;

const CONNECTED: i32 = 0;
const SYSTEM_ONE_PLAYER: i32 = 1;
const SYSTEM_TWO_PLAYER: i32 = 2;
const PLAYER1_UP: i32 = 3;
const PLAYER1_DOWN: i32 = 4;
const PLAYER1_LEFT: i32 = 5;
const PLAYER1_RIGHT: i32 = 6;
const PLAYER1_A: i32 = 7;
const PLAYER1_B: i32 = 8;
const PLAYER2_UP: i32 = 9;
const PLAYER2_DOWN: i32 = 10;
const PLAYER2_LEFT: i32 = 11;
const PLAYER2_RIGHT: i32 = 12;
const PLAYER2_A: i32 = 13;
const PLAYER2_B: i32 = 14;

pub struct ClassicController {
    runner: PluginSharedMemoryRunner,
}

impl ClassicController {
    pub async fn acquire() -> Result<ClassicController, JsValue> {
        let channel = PluginChannel::acquire("@rcade/input-classic", "1.0.0").await?;
        let runner = PluginSharedMemoryRunner::spawn(include_str!("./worker.js"), channel, 15)?;

        Ok(ClassicController { runner })
    }

    pub fn state(&self) -> ControllerState {
        let data_view = self.runner.lock_blocking().data_view();

        // web_sys::console::log_2(&JsValue::from_str("data_view"), &data_view);

        ControllerState {
            connected: data_view.at(CONNECTED).unwrap() != 0,
            system_one_player: data_view.at(SYSTEM_ONE_PLAYER).unwrap() != 0,
            system_two_player: data_view.at(SYSTEM_TWO_PLAYER).unwrap() != 0,
            player1_up: data_view.at(PLAYER1_UP).unwrap() != 0,
            player1_down: data_view.at(PLAYER1_DOWN).unwrap() != 0,
            player1_left: data_view.at(PLAYER1_LEFT).unwrap() != 0,
            player1_right: data_view.at(PLAYER1_RIGHT).unwrap() != 0,
            player1_a: data_view.at(PLAYER1_A).unwrap() != 0,
            player1_b: data_view.at(PLAYER1_B).unwrap() != 0,
            player2_up: data_view.at(PLAYER2_UP).unwrap() != 0,
            player2_down: data_view.at(PLAYER2_DOWN).unwrap() != 0,
            player2_left: data_view.at(PLAYER2_LEFT).unwrap() != 0,
            player2_right: data_view.at(PLAYER2_RIGHT).unwrap() != 0,
            player2_a: data_view.at(PLAYER2_A).unwrap() != 0,
            player2_b: data_view.at(PLAYER2_B).unwrap() != 0,
        }
    }
}
