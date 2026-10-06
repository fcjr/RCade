use core::fmt::Write;
use heapless::String;

pub const MOTOR_GATE_PINS: [u8; 6] = [6, 5, 1, 3, 0, 4];
pub const MOTOR_GATE_MASK: u32 = (1 << 6) | (1 << 5) | (1 << 1) | (1 << 3) | (1 << 0) | (1 << 4);

/// Stable identity from the factory eFuse MAC, not a changeable radio address.
pub fn device_id() -> String<32> {
    let mac = esp_hal::efuse::base_mac_address();
    let mut id = String::new();
    for (index, byte) in mac.as_bytes().iter().enumerate() {
        if index != 0 {
            id.push('-').expect("six-byte MAC fits the identity buffer");
        }
        write!(id, "{byte:02x}").expect("six-byte MAC fits the identity buffer");
    }
    id
}
