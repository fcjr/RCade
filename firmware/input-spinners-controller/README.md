# Input Classic Controller

Firmware for RP2040 (Raspberry Pi Pico) that provides a 2-player arcade controller with spinners, joysticks, and buttons as a vendor-specific USB HID device. Designed for use with Electron apps via `node-hid`.

## Features

- 2x GRS Spinners (UART)
- 2x 4-way Joysticks
- 6x Action buttons per player
- 1P/2P Start buttons
- Menu button
- Raw HID output (doesn't move mouse cursor)
- 5ms polling rate

## Wiring

All button/joystick inputs are active-low (directly wire to GND when pressed). The internal pull-up resistors are enabled.

### Spinners

```
Spinner 1                    Spinner 2
─────────────────────        ─────────────────────
GND  ───► Pico GND           GND  ───► Pico GND
5V   ───► Pico VBUS (pin 40) 5V   ───► Pico VBUS (pin 40)
TX   ───► Pico GPIO1 (pin 2) TX   ───► Pico GPIO5 (pin 7)
```

### GPIO Pinout

| GPIO | Function       | GPIO | Function       |
|------|----------------|------|----------------|
| 0    | (UART0 TX)     | 16   | P2 Joy Up      |
| 1    | Spinner 1 RX   | 17   | P2 Joy Down    |
| 2    | 1P Start       | 18   | P2 Joy Left    |
| 3    | 2P Start       | 19   | P2 Joy Right   |
| 4    | (UART1 TX)     | 20   | P2 Button A    |
| 5    | Spinner 2 RX   | 21   | P2 Button B    |
| 6    | P1 Joy Up      | 22   | P2 Button C    |
| 7    | P1 Joy Down    | 23   | (reserved)     |
| 8    | P1 Joy Left    | 24   | (reserved)     |
| 9    | P1 Joy Right   | 25   | (reserved)     |
| 10   | P1 Button A    | 26   | P2 Button D    |
| 11   | P1 Button B    | 27   | P2 Button E    |
| 12   | P1 Button C    | 28   | P2 Button F    |
| 13   | P1 Button D    | 29   | Menu           |
| 14   | P1 Button E    |      |                |
| 15   | P1 Button F    |      |                |

## HID Report Format

8 bytes, little-endian:

| Byte | Description |
|------|-------------|
| 0-1  | Spinner 1 delta (signed int16) |
| 2-3  | Spinner 2 delta (signed int16) |
| 4    | P1 inputs (see below) |
| 5    | P2 inputs (see below) |
| 6    | System inputs (see below) |
| 7    | Reserved (zero) |

### P1/P2 Input Bits (bytes 4-5)

| Bit | Input |
|-----|-------|
| 0   | Up |
| 1   | Down |
| 2   | Left |
| 3   | Right |
| 4   | Button A |
| 5   | Button B |
| 6   | Button C |
| 7   | Button D |

### System Input Bits (byte 6)

| Bit | Input |
|-----|-------|
| 0   | 1P Start |
| 1   | 2P Start |
| 2   | Menu |
| 3   | P1 Button E |
| 4   | P1 Button F |
| 5   | P2 Button E |
| 6   | P2 Button F |

## USB Device Info

- VID: `0x1209`
- PID: `0x0001`
- Manufacturer: "RCade"
- Product: "Input Classic Controller"

## Electron / Node.js Usage

```javascript
const HID = require('node-hid');

const device = new HID.HID(0x1209, 0x0001);

// Bit masks
const UP = 1, DOWN = 2, LEFT = 4, RIGHT = 8;
const BTN_A = 16, BTN_B = 32, BTN_C = 64, BTN_D = 128;
const START_1P = 1, START_2P = 2, MENU = 4;
const P1_BTN_E = 8, P1_BTN_F = 16, P2_BTN_E = 32, P2_BTN_F = 64;

device.on('data', (data) => {
  const spinner1 = data.readInt16LE(0);
  const spinner2 = data.readInt16LE(2);
  const p1 = data[4];
  const p2 = data[5];
  const sys = data[6];

  console.log(`Spinners: ${spinner1}, ${spinner2}`);
  console.log(`P1: ${p1.toString(2).padStart(8, '0')}`);
  console.log(`P2: ${p2.toString(2).padStart(8, '0')}`);
  console.log(`System: ${sys.toString(2).padStart(7, '0')}`);
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

## GRS Spinner DIP Switch Settings

Set the DIP switches on the GRS Spinner to:
- **Resolution**: 64 PPR
- **Signal Duration**: 0.5ms

## Protocol Details

GRS Spinner UART (from Thunderstick Studios):
- Baud: 115200, 8N1
- Right: `FF 00 00 01`
- Left: `FF 00 00 FE`

## License

MIT / Apache-2.0
