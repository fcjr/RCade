import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { KnobHub, type SerialAccess } from "./hub.ts";
import type { HidAccess } from "./hid.ts";
import type { PlayerMessage } from "./protocol.ts";
import { TKnob } from "./tknob.ts";

const KNOB_A = "40-4c-ca-5c-3c-24";
const KNOB_B = "40-4c-ca-5c-3c-99";
const hello = (id = KNOB_A) => ({
    type: "hello", device: "rcade-tknob", id,
    magnet: { pole_pairs: 7, direction: 1, zero: 57_152 }, max_points: 130,
});
const config = { target: 0, mass: 0, tension: 0, friction: 32_768 };

class FakeSerial extends EventEmitter {
    isOpen = true;
    writes: any[] = [];

    constructor(public identity: unknown = hello()) { super(); }

    write(line: string, callback: (error?: Error | null) => void) {
        const command = JSON.parse(line);
        this.writes.push(command);
        queueMicrotask(() => {
            callback();
            if (!this.isOpen) return;
            if (command.type === "hello") this.reply(this.identity);
            if (["config", "tare", "brake", "reset", "rumble"].includes(command.type)) {
                this.reply({ type: "ack", command: command.type, ...(command.id !== undefined ? { id: command.id } : {}), time_us: 100 });
            }
        });
    }

    reply(message: unknown) { this.emit("data", Buffer.from(JSON.stringify(message) + "\n")); }
    drain(callback: (error?: Error | null) => void) { queueMicrotask(callback); }
    close(callback: (error?: Error | null) => void) {
        this.isOpen = false;
        this.emit("close");
        callback();
    }
    disconnect() { this.isOpen = false; this.emit("close"); }
    /** Commands sent, without the leases. */
    types() { return this.writes.map(({ type }) => type).filter(type => type !== "lease"); }
}

/** What one attachment heard. */
class Heard {
    messages: PlayerMessage[] = [];
    readonly listen = (message: PlayerMessage) => { this.messages.push(message); };
    connected(player: number) {
        const last = this.messages.filter(m => m.type === "connection" && m.player === player).pop();
        return last?.type === "connection" && last.connected;
    }
    some(predicate: (message: any) => boolean) { return this.messages.some(predicate); }
}

async function until(predicate: () => boolean, timeout = 1500) {
    const end = Date.now() + timeout;
    while (!predicate()) {
        if (Date.now() > end) assert.fail("Timed out waiting for test state");
        await delay(5);
    }
}

/** Fake serial ports, each a knob with this id. */
function setup(ports: Record<string, string>) {
    const connections: Record<string, FakeSerial[]> = {};
    const serial: SerialAccess = {
        paths: async () => Object.keys(ports),
        open: async (path) => {
            const connection = new FakeSerial(hello(ports[path]));
            (connections[path] ??= []).push(connection);
            return connection;
        },
    };
    return { connections, serial };
}

test("a knob says who it is before anything changes its feel", async (t) => {
    const { connections, serial } = setup({ "TEST-A": KNOB_A });
    const hub = new KnobHub(serial);
    const game = new Heard();
    const attachment = hub.attach(game.listen);
    t.after(() => attachment.detach());
    await until(() => game.connected(1));
    const device = connections["TEST-A"][0];
    assert.deepEqual(device.writes.map(({ type }) => type).slice(0, 3), ["hello", "lease", "reset"]);
    assert.ok(game.some(m => m.type === "hello" && m.player === 1 && m.id === KNOB_A));
    attachment.send({ type: "config", player: 1, id: 5, config });
    await until(() => game.some(m => m.type === "ack" && m.id === 5 && m.player === 1));
    assert.deepEqual(device.writes.find(({ type }) => type === "config"), { type: "config", id: 5, config });
});

test("two knobs become P1 and P2, and commands go to the right one", async (t) => {
    const { connections, serial } = setup({ "TEST-1": KNOB_A, "TEST-2": KNOB_B });
    const hub = new KnobHub(serial);
    const game = new Heard();
    const attachment = hub.attach(game.listen);
    t.after(() => attachment.detach());
    await until(() => game.connected(1) && game.connected(2));
    attachment.send({ type: "brake", player: 2, id: 1 });
    attachment.send({ type: "tare", player: 1, id: 2, reference: 10, global_angle: 0 });
    await until(() => game.messages.filter(({ type }) => type === "ack").length >= 2);
    assert.deepEqual(connections["TEST-1"][0].types().slice(4), ["tare"]);
    assert.deepEqual(connections["TEST-2"][0].types().slice(4), ["brake"]);
    connections["TEST-2"][0].reply({ type: "tick", angle: 1, global_angle: 1, curve_angle: 1, velocity_q16: 0, time_us: 1 });
    await until(() => game.some(m => m.type === "tick" && m.player === 2));
});

test("a knob pinned to P2 is P2 even if it's found first", async (t) => {
    const { serial } = setup({ "TEST-PIN": KNOB_A });
    const hub = new KnobHub(serial, { seats: { p2: KNOB_A } });
    const game = new Heard();
    const attachment = hub.attach(game.listen);
    t.after(() => attachment.detach());
    await until(() => game.connected(2));
    assert.equal(game.connected(1), false);
});

test("commands for a missing player fail with their id", async (t) => {
    const { serial } = setup({ "TEST-ONE": KNOB_A });
    const hub = new KnobHub(serial);
    const game = new Heard();
    const attachment = hub.attach(game.listen);
    t.after(() => attachment.detach());
    await until(() => game.connected(1));
    attachment.send({ type: "brake", player: 2, id: 77 });
    assert.ok(game.some(m => m.type === "error" && m.id === 77 && m.player === 2));
});

test("the menu and a game share the knobs; only the game in front shapes them", async (t) => {
    const { connections, serial } = setup({ "TEST-SHARE": KNOB_A });
    const hub = new KnobHub(serial);
    const menu = new Heard();
    const menuAttachment = hub.attach(menu.listen);
    t.after(() => menuAttachment.detach());
    await until(() => menu.connected(1));
    const device = connections["TEST-SHARE"][0];

    const game = new Heard();
    const gameAttachment = hub.attach(game.listen);
    assert.ok(game.connected(1), "the game hears the knob is there at once");
    assert.equal(device.types().at(-1), "reset", "the game starts from stock");
    assert.equal(connections["TEST-SHARE"].length, 1, "no second connection");

    menuAttachment.send({ type: "brake", player: 1, id: 3 });
    assert.ok(menu.some(m => m.type === "error" && m.id === 3));
    gameAttachment.send({ type: "config", player: 1, id: 4, config });
    await until(() => game.some(m => m.type === "ack" && m.id === 4));
    assert.equal(menu.some(m => m.type === "ack" && m.id === 4), false, "replies go to the one who asked");

    device.reply({ type: "tick", angle: 1, global_angle: 1, curve_angle: 1, velocity_q16: 0, time_us: 1 });
    await until(() => menu.some(m => m.type === "tick") && game.some(m => m.type === "tick"));

    await gameAttachment.detach();
    await until(() => device.types().at(-1) === "brake");
    assert.deepEqual(device.types().slice(-2), ["reset", "brake"], "leaving drops the game's curves");
    assert.equal(device.isOpen, true, "the menu still has the knob");
});

test("the last to leave resets, brakes and closes", async () => {
    const { connections, serial } = setup({ "TEST-S1": KNOB_A, "TEST-S2": KNOB_B });
    const hub = new KnobHub(serial);
    const game = new Heard();
    const attachment = hub.attach(game.listen);
    await until(() => game.connected(1) && game.connected(2));
    await attachment.detach();
    for (const path of ["TEST-S1", "TEST-S2"]) {
        const device = connections[path][0];
        assert.deepEqual(device.types().slice(-2), ["reset", "brake"]);
        assert.equal(device.isOpen, false);
    }
    const leases = connections["TEST-S1"][0].writes.filter(({ type }) => type === "lease").length;
    await delay(250);
    assert.equal(connections["TEST-S1"][0].writes.filter(({ type }) => type === "lease").length, leases);
});

test("a knob keeps its lease alive without any game involvement", async (t) => {
    const { connections, serial } = setup({ "TEST-B": KNOB_A });
    const hub = new KnobHub(serial);
    const attachment = hub.attach(() => {});
    t.after(() => attachment.detach());
    await until(() => connections["TEST-B"]?.[0]?.writes.length >= 3);
    await delay(650);
    assert.ok(connections["TEST-B"][0].writes.filter(({ type }) => type === "lease").length >= 3);
});

test("a disconnect reconnects from stock curves without replaying the old config", async (t) => {
    const { connections, serial } = setup({ "TEST-D": KNOB_A });
    const hub = new KnobHub(serial);
    const game = new Heard();
    const attachment = hub.attach(game.listen);
    t.after(() => attachment.detach());
    await until(() => game.connected(1));
    attachment.send({ type: "config", player: 1, config });
    await until(() => game.some(m => m.type === "ack"));
    connections["TEST-D"][0].disconnect();
    await until(() => game.messages.some(m => m.type === "connection" && !m.connected && m.message === "T-Knob disconnected"));
    await until(() => connections["TEST-D"][1]?.types().length >= 4, 2500);
    assert.deepEqual(connections["TEST-D"][1].types(), ["hello", "reset", "brake", "tare"]);
    await until(() => game.connected(1));
});

test("a non-T-Knob is closed without sending output-affecting commands", async (t) => {
    const connection = new FakeSerial({ ...hello(), device: "not-a-tknob" });
    const hub = new KnobHub({ paths: async () => ["TEST-F"], open: async () => connection });
    const game = new Heard();
    const attachment = hub.attach(game.listen);
    t.after(() => attachment.detach());
    await until(() => !connection.isOpen);
    assert.deepEqual(connection.writes.map(({ type }) => type), ["hello"]);
    assert.equal(game.connected(1), false);
});

test("leaving during identity detection never sends reset to an unknown device", async () => {
    const connection = new FakeSerial({});
    const hub = new KnobHub({ paths: async () => ["TEST-G"], open: async () => connection });
    const attachment = hub.attach(() => {});
    await until(() => connection.writes.length === 1);
    await attachment.detach();
    await until(() => !connection.isOpen);
    assert.deepEqual(connection.writes.map(({ type }) => type), ["hello"]);
});

test("TEMPORARY: the old HID spinner stands in for a player with no knob", async (t) => {
    const { serial } = setup({ "TEST-HID": KNOB_A });
    let report: ((steps: [number, number]) => void) | undefined;
    const hid: HidAccess = { open: (callback) => { report = callback; return { close() {} }; } };
    const hub = new KnobHub(serial, { hid });
    const game = new Heard();
    const attachment = hub.attach(game.listen);
    t.after(() => attachment.detach());
    await until(() => game.connected(2) && game.some(m => m.type === "hello" && m.player === 1 && m.device === "rcade-tknob"));
    report!([5, 2]);
    // P1 is the knob, so the old left spinner's steps are dropped.
    assert.deepEqual(game.messages.filter(m => m.type === "tick").map(m => m.player), [2]);
    const tick = game.messages.find(m => m.type === "tick");
    assert.equal(tick?.type === "tick" && tick.global_angle, 2 * 1024);
    // Haptics for it are acked and ignored; tare works.
    attachment.send({ type: "config", player: 2, id: 8, config });
    attachment.send({ type: "tare", player: 2, id: 9, reference: 2048, global_angle: 0 });
    assert.ok(game.some(m => m.type === "ack" && m.id === 8) && game.some(m => m.type === "ack" && m.id === 9));
    report!([0, 1]);
    const last = game.messages.filter(m => m.type === "tick").pop();
    assert.equal(last?.type === "tick" && last.global_angle, 1024);
});

test("a knob the cabinet can't read says to reflash it, once", async () => {
    const device = new FakeSerial();
    const knob = new TKnob("TEST-OLD", device);
    await knob.ready;
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
        device.reply({ type: "tick", angle: 1, global_angle: 1, velocity_q16: 0, time_us: 1 });
        device.reply({ type: "tick", angle: 2, global_angle: 2, velocity_q16: 0, time_us: 2 });
        device.reply({ type: "stats", ticks: 1 });
    } finally {
        console.warn = warn;
        await knob.close(false);
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /TEST-OLD.*reflash/);
});

test("a newcomer finds the knobs fresh, and nobody hears the tare as a turn", async (t) => {
    const { connections, serial } = setup({ "TEST-FRESH": KNOB_A });
    const hub = new KnobHub(serial);
    const menu = new Heard();
    const menuAttachment = hub.attach(menu.listen);
    t.after(() => menuAttachment.detach());
    await until(() => menu.connected(1));
    const device = connections["TEST-FRESH"][0];
    device.reply({ type: "tick", angle: 1, global_angle: 50_000, curve_angle: 50_000, velocity_q16: 0, time_us: 1 });
    await until(() => menu.some(m => m.type === "tick"));

    const game = new Heard();
    const gameAttachment = hub.attach(game.listen);
    t.after(() => gameAttachment.detach());
    const hellos = (heard: Heard) => heard.messages.filter(m => m.type === "hello").length;
    const [menuHellos, gameHellos] = [hellos(menu), hellos(game)];
    device.reply({ type: "tick", angle: 1, global_angle: 50_000, curve_angle: 50_000, velocity_q16: 0, time_us: 2 });
    await until(() => device.types().slice(-3).join() === "reset,brake,tare");
    assert.deepEqual(device.writes.filter(({ type }) => type === "tare").at(-1), { type: "tare", global_angle: 0 });
    await until(() => hellos(menu) > menuHellos && hellos(game) > gameHellos);
    device.reply({ type: "tick", angle: 1, global_angle: 3, curve_angle: 3, velocity_q16: 0, time_us: 3 });
    await until(() => game.some(m => m.type === "tick"));
    assert.deepEqual(game.messages.filter(m => m.type === "tick").map(m => m.global_angle), [3]);
    assert.equal(menu.messages.filter(m => m.type === "tick" && m.global_angle === 50_000).length, 1, "the late old tick never arrives");
});
