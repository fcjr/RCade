/**
 * layout:
 * - 00 | Connected (1 byte)
 * - 01 | padding (1 byte, for alignment)
 * - 02-03 | spinner1 step_delta (i16, 2 bytes)
 * - 04-05 | spinner2 step_delta (i16, 2 bytes)
 * - 06-07 | step_resolution (u16, 2 bytes)
 * - 08-11 | spinner1 angle (f32, 4 bytes)
 * - 12-15 | spinner2 angle (f32, 4 bytes)
 */

const CONNECTED = 0;
const PLAYER1_SPINNER_STEP_DELTA = 2;
const PLAYER2_SPINNER_STEP_DELTA = 4;
const STEP_RESOLUTION_OFFSET = 6;
const PLAYER1_ANGLE = 8;
const PLAYER2_ANGLE = 12;
const MAX_DELTA = 1000;

let stepResolution = 1024; // default, updated by init message

/** Normalize angle to [-π, π] range */
function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

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

function writeU16(offset, value) {
    const cur_lock = lock();
    const view = new DataView(cur_lock.getDataView().buffer, cur_lock.getDataView().byteOffset);
    view.setUint16(offset, value, true);
    cur_lock.release();
}

function readF32(offset) {
    const cur_lock = lock();
    const view = new DataView(cur_lock.getDataView().buffer, cur_lock.getDataView().byteOffset);
    const value = view.getFloat32(offset, true);
    cur_lock.release();
    return value;
}

function writeF32(offset, value) {
    const cur_lock = lock();
    const view = new DataView(cur_lock.getDataView().buffer, cur_lock.getDataView().byteOffset);
    view.setFloat32(offset, value, true);
    cur_lock.release();
}

function handleMessage(data) {
    const { type } = data;

    if (type === "init") {
        stepResolution = data.step_resolution;
        writeU16(STEP_RESOLUTION_OFFSET, stepResolution);
    }

    if (type === "spinners") {
        const { spinner1_step_delta, spinner2_step_delta } = data;

        if (spinner1_step_delta !== 0) {
            const current = readI16(PLAYER1_SPINNER_STEP_DELTA);
            writeI16(PLAYER1_SPINNER_STEP_DELTA, Math.max(-MAX_DELTA, Math.min(MAX_DELTA, current + spinner1_step_delta)));
            const currentAngle = readF32(PLAYER1_ANGLE);
            writeF32(PLAYER1_ANGLE, normalizeAngle(currentAngle + (spinner1_step_delta / stepResolution) * 2 * Math.PI));
        }

        if (spinner2_step_delta !== 0) {
            const current = readI16(PLAYER2_SPINNER_STEP_DELTA);
            writeI16(PLAYER2_SPINNER_STEP_DELTA, Math.max(-MAX_DELTA, Math.min(MAX_DELTA, current + spinner2_step_delta)));
            const currentAngle = readF32(PLAYER2_ANGLE);
            writeF32(PLAYER2_ANGLE, normalizeAngle(currentAngle + (spinner2_step_delta / stepResolution) * 2 * Math.PI));
        }
    }

    if (type === "reset_angle") {
        const { player } = data;
        if (player === 1) {
            writeF32(PLAYER1_ANGLE, 0);
        } else if (player === 2) {
            writeF32(PLAYER2_ANGLE, 0);
        }
    }
}

function init() {
    write(CONNECTED, true);
}
