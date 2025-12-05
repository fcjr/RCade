/**
 * Shared memory layout (16 bytes):
 * - 0: connected (u8)
 * - 1: padding
 * - 2-3: spinner1 step_delta (i16)
 * - 4-5: spinner2 step_delta (i16)
 * - 6-7: step_resolution (u16)
 * - 8-11: spinner1 angle (f32)
 * - 12-15: spinner2 angle (f32)
 */

const CONNECTED = 0;
const SPINNER1_DELTA = 2;
const SPINNER2_DELTA = 4;
const STEP_RES = 6;
const SPINNER1_ANGLE = 8;
const SPINNER2_ANGLE = 12;
const MAX_DELTA = 1000;

let stepResolution = 64;

function withLock(fn) {
    const l = lock();
    const view = new DataView(l.getDataView().buffer, l.getDataView().byteOffset);
    const result = fn(view);
    l.release();
    return result;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function normalizeAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
}

function updateSpinner(view, deltaOffset, angleOffset, delta) {
    const currentDelta = view.getInt16(deltaOffset, true);
    view.setInt16(deltaOffset, clamp(currentDelta + delta, -MAX_DELTA, MAX_DELTA), true);

    const currentAngle = view.getFloat32(angleOffset, true);
    const newAngle = normalizeAngle(currentAngle + (delta / stepResolution) * 2 * Math.PI);
    view.setFloat32(angleOffset, newAngle, true);
}

function handleMessage(data) {
    if (data.type === "spinners") {
        const { spinner1_step_delta, spinner2_step_delta } = data;
        withLock((view) => {
            if (spinner1_step_delta !== 0) updateSpinner(view, SPINNER1_DELTA, SPINNER1_ANGLE, spinner1_step_delta);
            if (spinner2_step_delta !== 0) updateSpinner(view, SPINNER2_DELTA, SPINNER2_ANGLE, spinner2_step_delta);
        });
    }
}

async function init() {
    const config = await request({ type: "get_config" });
    stepResolution = config.step_resolution;

    withLock((view) => {
        view.setUint8(CONNECTED, 1);
        view.setUint16(STEP_RES, stepResolution, true);
    });
}
