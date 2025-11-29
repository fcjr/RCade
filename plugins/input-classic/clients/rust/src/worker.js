/**
 * layout (each item one byte)
 * - 00 | Connected
 * - 01 | sys: 1p
 * - 02 | sys: 2p
 * - 03 | p1: up
 * - 04 | p1: down
 * - 05 | p1: left
 * - 06 | p1: right
 * - 07 | p1: a
 * - 08 | p1: b
 * - 09 | p2: up
 * - 10 | p2: down
 * - 11 | p2: left
 * - 12 | p2: right
 * - 13 | p2: a
 * - 14 | p2: b
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

function write(action, state) {
    const cur_lock = lock();

    cur_lock.getDataView()[action] = state ? 1 : 0;
    cur_lock.release();
}

function handleMessage(data) {
    const { type, player, button, pressed } = data;

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
    }
}

// announce connected
function init() {
    write(CONNECTED, true);
}