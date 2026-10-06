import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Curve, Curves, curvesToWire, pulsesToWire, type CurvePointInput } from "./index.ts";

const close = (a: number, b: number, message?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${message ?? ""} ${a} vs ${b}`);

// The firmware's shared vectors: the curve maths here is the knob's.
interface WirePoint { x: number; y: number; in?: number; out?: number }
interface Case { name: string; curve: { points: WirePoint[]; flat_before?: boolean; flat_after?: boolean }; samples: [number, number][] }
const VECTORS: Case[] = JSON.parse(readFileSync(new URL("../../../../firmware/knob/core/vectors.json", import.meta.url), "utf8"));

test("curves match the knob's own vectors", () => {
    const degrees = (units: number) => units * 360 / 65_536;
    for (const { name, curve, samples } of VECTORS) {
        const points: CurvePointInput[] = curve.points.map((point, index, all) => {
            const at: CurvePointInput = { x: degrees(point.x), y: degrees(point.y) };
            const next = all[index + 1], previous = all[index - 1];
            if (point.out !== undefined) at.out = { x: degrees(point.x + (next.x - point.x) / 3), y: degrees(point.out) };
            if (point.in !== undefined) at.in = { x: degrees(point.x - (point.x - previous.x) / 3), y: degrees(point.in) };
            return at;
        });
        if (curve.flat_before) points.unshift({ x: -Infinity, y: points[0].y });
        if (curve.flat_after) points.push({ x: Infinity, y: points[points.length - 1].y });
        const built = Curve.points(points);
        for (const [x, value] of samples) {
            const units = built.valueAt(degrees(x)) * 65_536 / 360;
            // The knob rounds down, and its fixed point is within a hair of exact.
            assert.ok(units > value - 1e-3 && units < value + 1 + 1e-3, `${name} at ${x}: ${units} vs ${value}`);
        }
    }
});

test("the usage examples build what they say", () => {
    const detents = Curves.detents(24, { tension: 0.5 }).mass(2).friction(1);
    assert.equal(detents.get("target").targetAt(16), 15);
    assert.equal(detents.get("target").targetAt(720 + 344), 720 + 345);
    assert.equal(curvesToWire(detents).mass, 65_535, "2 is clamped to 1");
    assert.equal(Curves.detents(24).get("tension").valueAt(0), 0.5);

    const halves = Curves.tension(0.8).target(Curve.steps(12)).mass(Curve.compose(
        Curve.uniform(1, { angle: [0, 180] }),
        Curve.ramp(0, 1, { angle: [180, 360], ease: "in" }),
    ));
    close(halves.get("mass").valueAt(90), 1);
    close(halves.get("mass").valueAt(180), 0);
    assert.ok(halves.get("mass").valueAt(270) < 0.5, "eases in");
    close(halves.get("mass").valueAt(360 + 90), 1, "repeats");

    // Detents on the first turn, a smooth second turn.
    const two = Curve.compose(Curve.steps(12), Curve.ramp(360, 720, { angle: [360, 720] }));
    assert.equal(two.targetAt(31), 30);
    close(two.targetAt(500), 500);
    assert.equal(two.targetAt(720 + 31), 720 + 30);

    const stops = Curves.stop("left", { angle: -270 }).stop("right", { angle: 270 });
    assert.equal(stops.get("tension").valueAt(0), 0);
    assert.equal(stops.get("tension").valueAt(-1000), 1);
    assert.equal(stops.get("target").targetAt(-1000), -270);
    assert.equal(stops.get("tension").valueAt(1000), 1);
    assert.equal(stops.get("target").targetAt(1000), 270);
    close(stops.get("friction").valueAt(270), 1);
    close(stops.get("friction").valueAt(360), 0.5);
    assert.equal(stops.get("friction").valueAt(1000), 0);
    close(stops.get("friction").valueAt(-270 - 45), 0.75);
    assert.equal(stops.get("friction").valueAt(0), 0.5);
    close(Curves.wall("left", { friction: 0.2 }).get("friction").valueAt(-90), 0.1);
});

test("builders never change", () => {
    const base = Curves.create();
    const heavy = base.mass(1);
    assert.equal(base.get("mass").valueAt(0), 0);
    assert.equal(heavy.get("mass").valueAt(0), 1);
});

test("bad curves throw", () => {
    assert.throws(() => Curve.steps(4, { angle: [0, Infinity] }));
    assert.throws(() => Curve.compose(Curve.ramp(0, 1), Curve.ramp(0, 1, { angle: [400, 500] })), /starts at 400/);
    assert.throws(() => Curve.points([{ x: 5, y: 0 }, { x: 4, y: 0 }]));
    assert.throws(() => Curve.points([{ x: -Infinity, y: 0 }, { x: 0, y: 1 }]), /flat/);
});

test("rumbles take web-haptics patterns", () => {
    // Like web-haptics' trigger: unset intensities take the option, default 0.5.
    assert.deepEqual(pulsesToWire(200), [{ delay_ms: 0, duration_ms: 200, intensity: 32_768 }]);
    assert.equal(pulsesToWire(200, { intensity: 1 })![0].intensity, 65_535);
    assert.deepEqual(pulsesToWire([100, 50, 100])!.map(p => [p.delay_ms, p.duration_ms]), [[0, 100], [50, 100]]);
    // A preset's own intensities win over the option.
    assert.equal(pulsesToWire("heavy", { intensity: 0.2 })![0].intensity, 65_535);
    assert.deepEqual(pulsesToWire(), [{ delay_ms: 0, duration_ms: 25, intensity: Math.round(0.7 * 65_536) }]);
    assert.equal(pulsesToWire(5_000)![0].duration_ms, 1_000, "clamped to a second");
    // Nothing plays, with a warning, rather than throwing mid-game.
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(pulsesToWire("nope"), null);
        assert.equal(pulsesToWire([{ duration: -1 }]), null);
        assert.equal(pulsesToWire(Array(40).fill(10)), null, "more pulses than the knob holds");
    } finally {
        console.warn = warn;
    }
});

test("a wall on a curve with no span holds its values on both sides", () => {
    // One point: the same value everywhere.
    const single = Curves.tension(Curve.points([{ x: 50, y: 0.3 }])).wall("left", { angle: 0 });
    assert.equal(single.get("tension").valueAt(-10), 1);
    close(single.get("tension").valueAt(20), 0.3);
    close(single.get("tension").valueAt(900), 0.3);
    // A jump at one x: its two values either side, the wall past them.
    const jump = Curves.tension(Curve.points([{ x: 90, y: 0.2 }, { x: 90, y: 0.8 }])).wall("right", { angle: 180 });
    close(jump.get("tension").valueAt(45), 0.2);
    close(jump.get("tension").valueAt(135), 0.8);
    assert.equal(jump.get("tension").valueAt(500), 1);
});
