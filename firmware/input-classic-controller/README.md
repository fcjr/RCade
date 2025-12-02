# Input Classic Controller

Firmware for RP2040 (Raspberry Pi Pico) that reads one or two GRS Spinners via UART and exposes them as a vendor-specific USB HID device. Designed for use with Electron apps via `node-hid`.

## Features

- Supports 1 or 2 GRS Spinners
- Raw HID output (doesn't move mouse cursor)
- 5ms polling rate
- Signed 16-bit delta values per spinner

## Wiring

```
Spinner 1                    Spinner 2
─────────────────────        ─────────────────────
GND  ───► Pico GND           GND  ───► Pico GND
5V   ───► Pico VBUS (pin 40) 5V   ───► Pico VBUS (pin 40)
TX   ───► Pico GPIO1 (pin 2) TX   ───► Pico GPIO5 (pin 7)
```

## HID Report Format

8 bytes, little-endian:

| Bytes | Description |
|-------|-------------|
| 0-1   | Spinner 1 delta (signed int16) |
| 2-3   | Spinner 2 delta (signed int16) |
| 4-7   | Reserved (zeros) |

## USB Device Info

- VID: `0x1209`
- PID: `0x0001`
- Manufacturer: "RCade"
- Product: "Input Classic Controller"

## Electron / Node.js Usage

```javascript
const HID = require('node-hid');

// Find and open device
const device = new HID.HID(0x1209, 0x0001);

device.on('data', (data) => {
  const spinner1 = data.readInt16LE(0);
  const spinner2 = data.readInt16LE(2);
  console.log(`Spinner 1: ${spinner1}, Spinner 2: ${spinner2}`);
});

device.on('error', (err) => {
  console.error('HID error:', err);
});
```

## Building

```bash
# Install prerequisites
rustup target add thumbv6m-none-eabi
cargo install elf2uf2-rs

# Build
cargo build --release
```

## Flashing

1. Hold BOOTSEL on Pico, plug in USB, release
2. Run:

```bash
elf2uf2-rs -d target/thumbv6m-none-eabi/release/input-classic-controller
```

Or mount and copy manually:

```bash
elf2uf2-rs target/thumbv6m-none-eabi/release/input-classic-controller /path/to/RPI-RP2/firmware.uf2
```

## GRS Spinner DIP Switch Settings

Set the DIP switches on the GRS Spinner to:
- **Resolution**: 1024 PPR
- **Signal Duration**: 5ms

## Protocol Details

GRS Spinner UART (from Thunderstick Studios):
- Baud: 115200, 8N1
- Right: `FF 00 00 01`
- Left: `FF 00 00 FE`

## License

MIT / Apache-2.0
