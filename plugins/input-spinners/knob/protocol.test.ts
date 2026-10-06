import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceMessage, gameCommand, JsonLines, MAX_FRAME_BYTES, MAX_POINTS } from "./protocol.ts";

const TURN = 65_536;

/** Stock curves, as the knob's integers. */
function nativeConfig() {
    return { target: 0, mass: 0, tension: 0, friction: 32_768 };
}

const config = (fields: Record<string, unknown> = {}) => ({ type: "config", player: 1, config: { ...nativeConfig(), ...fields } });

test("games name a player; lease never passes", () => {
    assert.deepEqual(gameCommand({ type: "hello", player: 2, calibration: "hidden" }), { type: "hello", player: 2 });
    assert.equal(gameCommand({ type: "hello" }), undefined, "no player");
    assert.equal(gameCommand({ type: "hello", player: 3 }), undefined);
    for (const type of ["lease", "arm", "stop", "probe", "kick", "excite", "capture_dump", "stats"]) assert.equal(gameCommand({ type, player: 1 }), undefined, type);
    for (const type of ["reset", "brake"]) assert.deepEqual(gameCommand({ type, player: 1, id: 4 }), { type, player: 1, id: 4 });
    assert.equal(gameCommand({ type: "brake", player: 1, id: -1 }), undefined);
    assert.deepEqual(gameCommand(config()), config());
    assert.equal(gameCommand({ type: "config", player: 1, config: {} }), undefined);
});

test("tare takes a global angle and the reading it was taken against", () => {
    assert.deepEqual(gameCommand({ type: "tare", player: 1 }), { type: "tare", player: 1, global_angle: 0 });
    assert.deepEqual(gameCommand({ type: "tare", player: 1, global_angle: -5 * TURN, reference: 123 }),
        { type: "tare", player: 1, global_angle: -5 * TURN, reference: 123 });
    assert.equal(gameCommand({ type: "tare", player: 1, global_angle: 0.5 }), undefined);
    assert.equal(gameCommand({ type: "tare", player: 1, reference: "1" }), undefined);
});

test("rumbles are bounded", () => {
    const pulse = { delay_ms: 0, duration_ms: 30, intensity: 65_535 };
    assert.deepEqual(gameCommand({ type: "rumble", player: 1, pulses: [{ ...pulse, extra: 1 }] }), { type: "rumble", player: 1, pulses: [pulse] });
    assert.equal(gameCommand({ type: "rumble", player: 1, pulses: Array(17).fill(pulse) }), undefined);
    assert.equal(gameCommand({ type: "rumble", player: 1, pulses: [{ ...pulse, duration_ms: 5_001 }] }), undefined);
    assert.equal(gameCommand({ type: "rumble", player: 1, pulses: [{ ...pulse, intensity: TURN }] }), undefined);
});

test("a setting is one number or a curve, in the knob's integer units", () => {
    for (const mass of [-1, TURN, 0.5, Infinity, NaN, "0"]) assert.equal(gameCommand(config({ mass })), undefined);
    // Targets are angles, and may be many turns away.
    assert.ok(gameCommand(config({ target: -40 * TURN })));
    const tension = { points: [{ x: 0, y: 0 }, { x: 30_000, y: 65_535 }] };
    assert.deepEqual(gameCommand(config({ tension })), config({ tension }));
});

test("curve points never go back, jump in pairs, and stay under the limit", () => {
    const with_ = (tension: unknown) => gameCommand(config({ tension }));
    assert.ok(with_({ points: [{ x: -3 * TURN, y: 1 }], flat_before: true, flat_after: true }));
    assert.ok(with_({ points: [{ x: 5, y: 1 }, { x: 5, y: 2 }] }), "a jump");
    assert.equal(with_({ points: [{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }] }), undefined, "three at one x");
    assert.equal(with_({ points: [{ x: 5, y: 1 }, { x: 4, y: 2 }] }), undefined, "backwards");
    assert.equal(with_({ points: [] }), undefined);
    assert.equal(with_({ points: [{ x: 0, y: 1 }], flat_before: 1 }), undefined);
    assert.equal(with_({ points: Array.from({ length: MAX_POINTS + 1 }, (_, i) => ({ x: i, y: 0 })) }), undefined);
});

test("Bezier handles are range-checked and forwarded; unknown fields are stripped", () => {
    const mass = { points: [{ x: 0, y: 100, in: 50, out: 200 }, { x: 10, y: 0 }] };
    assert.deepEqual(gameCommand(config({ mass })), config({ mass }));
    const extra = { points: [{ ...mass.points[0], out_x: 3 }, mass.points[1]], mode: "bezier" };
    assert.deepEqual(gameCommand(config({ mass: extra })), config({ mass }));
    assert.equal(gameCommand(config({ mass: { points: [{ x: 0, y: 100, in: TURN }] } })), undefined);
});

test("JSON framing handles fragmentation, coalescing, CRLF and split UTF-8", () => {
    const values: unknown[] = [];
    let errors = 0;
    const parser = new JsonLines((value) => values.push(value), () => errors++);
    const bytes = Buffer.from('{"message":"knob ✓"}\r\n{"type":"ack"}\n');
    for (const byte of bytes) parser.push(Buffer.from([byte]));
    assert.deepEqual(values, [{ message: "knob ✓" }, { type: "ack" }]);
    assert.equal(errors, 0);
});

test("an oversized line is discarded to newline, then framing recovers", () => {
    const values: unknown[] = [];
    let errors = 0;
    const parser = new JsonLines((value) => values.push(value), () => errors++);
    parser.push(Buffer.alloc(MAX_FRAME_BYTES * 3, 97));
    parser.push(Buffer.from('\nnot json\n{"valid":true}\n'));
    assert.deepEqual(values, [{ valid: true }]);
    assert.equal(errors, 2);
});

test("generic Espressif identity is not sufficient", () => {
    const hello = { type: "hello", device: "rcade-tknob", id: "40-4c-ca-5c-3c-24", magnet: null, max_points: MAX_POINTS };
    assert.ok(deviceMessage(hello));
    assert.ok(deviceMessage({ ...hello, magnet: { pole_pairs: 7, direction: 1, zero: 57_152 } }));
    assert.equal(deviceMessage({ ...hello, device: "esp32" }), undefined);
    assert.equal(deviceMessage({ ...hello, id: "" }), undefined);
});

test("acks and errors keep their ids", () => {
    assert.deepEqual(deviceMessage({ type: "ack", command: "tare", id: 9, time_us: 5 }), { type: "ack", command: "tare", id: 9, time_us: 5 });
    assert.deepEqual(deviceMessage({ type: "error", message: "no", id: 9 }), { type: "error", message: "no", id: 9 });
    assert.equal(deviceMessage({ type: "ack", command: "tare", id: -9, time_us: 5 }), undefined);
});

test("ticks carry an encoder angle and an integer global angle", () => {
    const tick = { type: "tick", angle: 27_080, global_angle: -1_000_000, curve_angle: -1_000_100, velocity_q16: 0, time_us: 10_000 };
    assert.deepEqual(deviceMessage(tick), tick);
    assert.equal(deviceMessage({ ...tick, angle: -1 }), undefined);
    assert.equal(deviceMessage({ ...tick, angle: TURN }), undefined);
    assert.equal(deviceMessage({ ...tick, global_angle: 0.5 }), undefined);
    assert.equal(deviceMessage({ ...tick, curve_angle: undefined }), undefined, "ticks say where the curves are");
});
