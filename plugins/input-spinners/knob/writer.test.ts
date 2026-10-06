import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandWriter } from "./writer.ts";

class HeldOutput {
    writes: { type: string; config?: unknown }[] = [];
    private complete?: () => void;

    write(line: string, callback: (error?: Error | null) => void) {
        this.writes.push(JSON.parse(line));
        callback();
    }

    drain(callback: (error?: Error | null) => void) {
        this.complete = callback;
    }

    flush() {
        const complete = this.complete;
        this.complete = undefined;
        complete?.();
    }
}

function config(value: number) {
    return { target: value, mass: value, tension: value, friction: value };
}

test("only the newest config is written and the write queue stays bounded", (t) => {
    const output = new HeldOutput();
    const writer = new CommandWriter(output, assert.fail);
    t.after(() => writer.close());
    writer.send({ type: "hello" });
    writer.send({ type: "config", config: config(1) });
    writer.send({ type: "brake" });
    for (let i = 0; i < 1000; i++) assert.ok(writer.send({ type: "config", config: config(5) }));
    output.flush();
    assert.deepEqual(output.writes[1], { type: "config", config: config(5) });
    output.flush();
    assert.equal(output.writes[2].type, "brake");
    for (let i = 0; i < 8; i++) assert.ok(writer.send({ type: "hello" }));
    assert.equal(writer.send({ type: "hello" }), false);
});

test("reset drops queued work, then brake follows it", (t) => {
    const output = new HeldOutput();
    const writer = new CommandWriter(output, assert.fail);
    t.after(() => writer.close());
    writer.send({ type: "hello" });
    writer.send({ type: "config", config: config(9) });
    writer.send({ type: "lease" });
    writer.send({ type: "reset" });
    writer.send({ type: "brake" });
    output.flush();
    output.flush();
    output.flush();
    assert.deepEqual(output.writes.map(({ type }) => type), ["hello", "reset", "brake"]);
});

test("a lease delayed by backpressure is dropped rather than sent late", (t) => {
    let now = 0;
    const output = new HeldOutput();
    const writer = new CommandWriter(output, assert.fail, () => now);
    t.after(() => writer.close());
    writer.send({ type: "hello" });
    writer.send({ type: "lease" });
    now = 251;
    output.flush();
    assert.deepEqual(output.writes.map(({ type }) => type), ["hello"]);
});

test("closing discards all pending work and blocks future commands", () => {
    const output = new HeldOutput();
    const writer = new CommandWriter(output, assert.fail);
    writer.send({ type: "hello" });
    writer.send({ type: "brake" });
    writer.close();
    output.flush();
    assert.equal(writer.send({ type: "lease" }), false);
    assert.deepEqual(output.writes.map(({ type }) => type), ["hello"]);
});
