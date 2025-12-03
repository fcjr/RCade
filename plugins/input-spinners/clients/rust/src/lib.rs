use rcade_sdk::{channel::PluginChannel, shmem_runner::PluginSharedMemoryRunner};
use wasm_bindgen::JsValue;

const CONNECTED: usize = 0;
// Byte 1 is padding for alignment
const PLAYER1_SPINNER_DELTA: usize = 2; // i16 (2 bytes)
const PLAYER2_SPINNER_DELTA: usize = 4; // i16 (2 bytes)

/// Controller for spinner input devices.
///
/// Use polling pattern: call `delta(player)` each frame to get accumulated
/// movement since last call. The value resets to 0 after reading.
pub struct SpinnerController {
    runner: PluginSharedMemoryRunner,
}

impl SpinnerController {
    pub async fn acquire() -> Result<SpinnerController, JsValue> {
        let channel = PluginChannel::acquire("@rcade/input-spinners", "1.0.0").await?;
        let runner = PluginSharedMemoryRunner::spawn(include_str!("./worker.js"), channel, 6)?;

        Ok(SpinnerController { runner })
    }

    /// Returns whether the spinner controller is connected.
    pub fn connected(&self) -> bool {
        let lock = self.runner.lock_blocking();
        let data_view = lock.data_view();
        data_view.at(CONNECTED as i32).unwrap() != 0
    }

    /// Returns accumulated delta for the given player (1 or 2) since last call, then resets to 0.
    pub fn delta(&self, player: u8) -> i16 {
        let offset = match player {
            1 => PLAYER1_SPINNER_DELTA,
            2 => PLAYER2_SPINNER_DELTA,
            _ => return 0,
        };

        let lock = self.runner.lock_blocking();
        let data_view = lock.data_view();

        let value = read_i16(&data_view, offset);
        write_i16(&data_view, offset, 0);

        value
    }
}

fn read_i16(data_view: &js_sys::Uint8Array, offset: usize) -> i16 {
    let low = data_view.at(offset as i32).unwrap_or(0);
    let high = data_view.at((offset + 1) as i32).unwrap_or(0);
    i16::from_le_bytes([low, high])
}

fn write_i16(data_view: &js_sys::Uint8Array, offset: usize, value: i16) {
    let bytes = value.to_le_bytes();
    data_view.set_index(offset as u32, bytes[0]);
    data_view.set_index((offset + 1) as u32, bytes[1]);
}
