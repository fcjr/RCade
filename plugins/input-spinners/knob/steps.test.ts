import assert from "node:assert/strict";
import { test } from "node:test";
import { StepCounter } from "./steps.ts";

test("a turn is 64 steps, and slow turning adds up", () => {
    const counter = new StepCounter();
    assert.equal(counter.take(5_000), 0, "the first angle only sets the start");
    assert.equal(counter.take(5_000 + 65_536), 64);
    let steps = 0;
    for (let i = 1; i <= 100; i++) steps += counter.take(5_000 + 65_536 + i * 100);
    assert.equal(steps, 9, "10000 units is 9 whole steps");
    assert.equal(counter.take(5_000 + 65_536), -9, "and back again");
});

test("after forget, a jump in angle isn't a turn", () => {
    const counter = new StepCounter();
    counter.take(0);
    counter.forget();
    assert.equal(counter.take(1_000_000), 0);
    assert.equal(counter.take(1_000_000 - 1024 * 3), -3);
});
