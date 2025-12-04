use rcade_sdk::{channel::PluginChannel, shmem_runner::PluginSharedMemoryRunner};
use wasm_bindgen::JsValue;

// Shared memory layout (must match worker.js)
const CONNECTED: usize = 0;
const SPINNER1_DELTA: usize = 2;
const SPINNER2_DELTA: usize = 4;
const STEP_RES: usize = 6;
const SPINNER1_ANGLE: usize = 8;
const SPINNER2_ANGLE: usize = 12;

/// Controller for spinner input devices.
///
/// Poll `step_delta(player)` each frame to get accumulated movement (resets after read).
/// Use `step_resolution()` to convert steps to rotations.
pub struct SpinnerController {
    runner: PluginSharedMemoryRunner,
}

impl SpinnerController {
    pub async fn acquire() -> Result<Self, JsValue> {
        let channel = PluginChannel::acquire("@rcade/input-spinners", "1.0.0").await?;
        let runner = PluginSharedMemoryRunner::spawn(include_str!("./worker.js"), channel, 16)?;
        Ok(Self { runner })
    }

    pub fn connected(&self) -> bool {
        let lock = self.runner.lock_blocking();
        lock.data_view().at(CONNECTED as i32).unwrap_or(0) != 0
    }

    /// Returns accumulated step delta since last call, then resets to 0.
    pub fn step_delta(&self, player: u8) -> i16 {
        let offset = match player {
            1 => SPINNER1_DELTA,
            2 => SPINNER2_DELTA,
            _ => return 0,
        };
        let lock = self.runner.lock_blocking();
        let view = lock.data_view();
        let val = read_i16(&view, offset);
        write_i16(&view, offset, 0);
        val
    }

    /// Steps per full rotation.
    pub fn step_resolution(&self) -> u16 {
        let lock = self.runner.lock_blocking();
        read_u16(&lock.data_view(), STEP_RES)
    }

    /// Current angle in radians, normalized to [-π, π].
    pub fn angle(&self, player: u8) -> f32 {
        let offset = match player {
            1 => SPINNER1_ANGLE,
            2 => SPINNER2_ANGLE,
            _ => return 0.0,
        };
        let lock = self.runner.lock_blocking();
        read_f32(&lock.data_view(), offset)
    }

    /// Reset angle to 0.
    pub fn reset(&self, player: u8) {
        let offset = match player {
            1 => SPINNER1_ANGLE,
            2 => SPINNER2_ANGLE,
            _ => return,
        };
        let lock = self.runner.lock_blocking();
        write_f32(&lock.data_view(), offset, 0.0);
    }
}

fn read_i16(view: &js_sys::Uint8Array, offset: usize) -> i16 {
    i16::from_le_bytes([
        view.at(offset as i32).unwrap_or(0),
        view.at((offset + 1) as i32).unwrap_or(0),
    ])
}

fn read_u16(view: &js_sys::Uint8Array, offset: usize) -> u16 {
    u16::from_le_bytes([
        view.at(offset as i32).unwrap_or(0),
        view.at((offset + 1) as i32).unwrap_or(0),
    ])
}

fn write_i16(view: &js_sys::Uint8Array, offset: usize, val: i16) {
    let b = val.to_le_bytes();
    view.set_index(offset as u32, b[0]);
    view.set_index((offset + 1) as u32, b[1]);
}

fn read_f32(view: &js_sys::Uint8Array, offset: usize) -> f32 {
    f32::from_le_bytes([
        view.at(offset as i32).unwrap_or(0),
        view.at((offset + 1) as i32).unwrap_or(0),
        view.at((offset + 2) as i32).unwrap_or(0),
        view.at((offset + 3) as i32).unwrap_or(0),
    ])
}

fn write_f32(view: &js_sys::Uint8Array, offset: usize, val: f32) {
    let b = val.to_le_bytes();
    view.set_index(offset as u32, b[0]);
    view.set_index((offset + 1) as u32, b[1]);
    view.set_index((offset + 2) as u32, b[2]);
    view.set_index((offset + 3) as u32, b[3]);
}
