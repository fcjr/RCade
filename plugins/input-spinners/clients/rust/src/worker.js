/**
 * layout:
 * - 00 | Connected (1 byte)
 * - 01 | padding (1 byte, for alignment)
 * - 02-03 | spinner1 delta (i16, 2 bytes)
 * - 04-05 | spinner2 delta (i16, 2 bytes)
 */

const CONNECTED = 0;
const PLAYER1_SPINNER_DELTA = 2;
const PLAYER2_SPINNER_DELTA = 4;
const MAX_DELTA = 1000;

function write(offset, value) {
    const cur_lock = lock();
    cur_lock.getDataView()[offset] = value ? 1 : 0;
    cur_lock.release();
}

function readI16(offset) {
    const cur_lock = lock();
    const view = new DataView(cur_lock.getDataView().buffer, cur_lock.getDataView().byteOffset);
    const value = view.getInt16(offset, true);
    cur_lock.release();
    return value;
}

function writeI16(offset, value) {
    const cur_lock = lock();
    const view = new DataView(cur_lock.getDataView().buffer, cur_lock.getDataView().byteOffset);
    view.setInt16(offset, value, true);
    cur_lock.release();
}

function handleMessage(data) {
    const { type } = data;

    if (type === "spinners") {
        const { spinner1, spinner2 } = data;

        if (spinner1 !== 0) {
            const current = readI16(PLAYER1_SPINNER_DELTA);
            writeI16(PLAYER1_SPINNER_DELTA, Math.max(-MAX_DELTA, Math.min(MAX_DELTA, current + spinner1)));
        }

        if (spinner2 !== 0) {
            const current = readI16(PLAYER2_SPINNER_DELTA);
            writeI16(PLAYER2_SPINNER_DELTA, Math.max(-MAX_DELTA, Math.min(MAX_DELTA, current + spinner2)));
        }
    }
}

function init() {
    write(CONNECTED, true);
}
