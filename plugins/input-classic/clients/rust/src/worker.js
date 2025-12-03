/**
 * layout:
 * - 00 | Connected (1 byte)
 * - 01 | sys: 1p (1 byte)
 * - 02 | sys: 2p (1 byte)
 * - 03 | p1: up (1 byte)
 * - 04 | p1: down (1 byte)
 * - 05 | p1: left (1 byte)
 * - 06 | p1: right (1 byte)
 * - 07 | p1: a (1 byte)
 * - 08 | p1: b (1 byte)
 * - 09 | p2: up (1 byte)
 * - 10 | p2: down (1 byte)
 * - 11 | p2: left (1 byte)
 * - 12 | p2: right (1 byte)
 * - 13 | p2: a (1 byte)
 * - 14 | p2: b (1 byte)
 * - 15 | padding (1 byte, for alignment)
 * - 16-17 | spinner1 delta (i16, 2 bytes)
 * - 18-21 | spinner1 position (i32, 4 bytes)
 * - 22-23 | spinner2 delta (i16, 2 bytes)
 * - 24-27 | spinner2 position (i32, 4 bytes)
 */

const CONNECTED = 0;
const SYSTEM_ONE_PLAYER = 1;
const SYSTEM_TWO_PLAYER = 2;
const PLAYER1_UP = 3;
const PLAYER1_DOWN = 4;
const PLAYER1_LEFT = 5;
const PLAYER1_RIGHT = 6;
const PLAYER1_A = 7;
const PLAYER1_B = 8;
const PLAYER2_UP = 9;
const PLAYER2_DOWN = 10;
const PLAYER2_LEFT = 11;
const PLAYER2_RIGHT = 12;
const PLAYER2_A = 13;
const PLAYER2_B = 14;
// Byte 15 is padding for alignment
const SPINNER1_DELTA = 16;   // i16 (2 bytes)
const SPINNER1_POSITION = 18; // i32 (4 bytes)
const SPINNER2_DELTA = 22;   // i16 (2 bytes)
const SPINNER2_POSITION = 24; // i32 (4 bytes)

function write(action, state) {
    const cur_lock = lock();

    cur_lock.getDataView()[action] = state ? 1 : 0;
    cur_lock.release();
}

function writeI16(offset, value) {
    const cur_lock = lock();
    const view = new DataView(cur_lock.getDataView().buffer, cur_lock.getDataView().byteOffset);
    view.setInt16(offset, value, true); // little-endian
    cur_lock.release();
}

function writeI32(offset, value) {
    const cur_lock = lock();
    const view = new DataView(cur_lock.getDataView().buffer, cur_lock.getDataView().byteOffset);
    view.setInt32(offset, value, true); // little-endian
    cur_lock.release();
}

function readI32(offset) {
    const cur_lock = lock();
    const view = new DataView(cur_lock.getDataView().buffer, cur_lock.getDataView().byteOffset);
    const value = view.getInt32(offset, true); // little-endian
    cur_lock.release();
    return value;
}

function handleMessage(data) {
    const { type, player, button, pressed, delta } = data;

    if (type === "button") {
        if (player === 1) {
            if (button === "A") {
                write(PLAYER1_A, pressed);
            } else if (button === "B") {
                write(PLAYER1_B, pressed);
            } else if (button === "UP") {
                write(PLAYER1_UP, pressed);
            } else if (button === "DOWN") {
                write(PLAYER1_DOWN, pressed);
            } else if (button === "LEFT") {
                write(PLAYER1_LEFT, pressed);
            } else if (button === "RIGHT") {
                write(PLAYER1_RIGHT, pressed);
            }
        } else if (player === 2) {
            if (button === "A") {
                write(PLAYER2_A, pressed);
            } else if (button === "B") {
                write(PLAYER2_B, pressed);
            } else if (button === "UP") {
                write(PLAYER2_UP, pressed);
            } else if (button === "DOWN") {
                write(PLAYER2_DOWN, pressed);
            } else if (button === "LEFT") {
                write(PLAYER2_LEFT, pressed);
            } else if (button === "RIGHT") {
                write(PLAYER2_RIGHT, pressed);
            }
        }
    } else if (type === "system") {
        if (button === "ONE_PLAYER") {
            write(SYSTEM_ONE_PLAYER, pressed);
        } else if (button === "TWO_PLAYER") {
            write(SYSTEM_TWO_PLAYER, pressed);
        }
    } else if (type === "spinner") {
        if (player === 1) {
            writeI16(SPINNER1_DELTA, delta);
            const currentPos = readI32(SPINNER1_POSITION);
            writeI32(SPINNER1_POSITION, currentPos + delta);
        } else if (player === 2) {
            writeI16(SPINNER2_DELTA, delta);
            const currentPos = readI32(SPINNER2_POSITION);
            writeI32(SPINNER2_POSITION, currentPos + delta);
        }
    }
}

// announce connected
function init() {
    write(CONNECTED, true);
}