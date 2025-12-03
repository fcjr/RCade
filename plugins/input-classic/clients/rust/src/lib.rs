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
// Byte 15 is padding for alignment
const PLAYER1_SPINNER_DELTA: usize = 16; // i16 (2 bytes)
const PLAYER1_SPINNER_POSITION: usize = 18; // i32 (4 bytes)
const PLAYER2_SPINNER_DELTA: usize = 22; // i16 (2 bytes)
const PLAYER2_SPINNER_POSITION: usize = 24; // i32 (4 bytes)

pub struct ClassicController {
    runner: PluginSharedMemoryRunner,
}

impl ClassicController {
    pub async fn acquire() -> Result<ClassicController, JsValue> {
        let channel = PluginChannel::acquire("@rcade/input-classic", "1.0.0").await?;
        let runner = PluginSharedMemoryRunner::spawn(include_str!("./worker.js"), channel, 28)?;

        Ok(ClassicController { runner })
    }

    pub fn state(&self) -> ControllerState {
        let data_view = self.runner.lock_blocking().data_view();

        // Read spinner values from the shared buffer
        let player1_spinner_delta = read_i16(&data_view, PLAYER1_SPINNER_DELTA);
        let player1_spinner_position = read_i32(&data_view, PLAYER1_SPINNER_POSITION);
        let player2_spinner_delta = read_i16(&data_view, PLAYER2_SPINNER_DELTA);
        let player2_spinner_position = read_i32(&data_view, PLAYER2_SPINNER_POSITION);

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
            player1_spinner_delta,
            player1_spinner_position,
            player2_spinner_delta,
            player2_spinner_position,
        }
    }
}

fn read_i16(data_view: &js_sys::Uint8Array, offset: usize) -> i16 {
    let low = data_view.at(offset as i32).unwrap_or(0);
    let high = data_view.at((offset + 1) as i32).unwrap_or(0);
    i16::from_le_bytes([low, high])
}

fn read_i32(data_view: &js_sys::Uint8Array, offset: usize) -> i32 {
    let b0 = data_view.at(offset as i32).unwrap_or(0);
    let b1 = data_view.at((offset + 1) as i32).unwrap_or(0);
    let b2 = data_view.at((offset + 2) as i32).unwrap_or(0);
    let b3 = data_view.at((offset + 3) as i32).unwrap_or(0);
    i32::from_le_bytes([b0, b1, b2, b3])
}
