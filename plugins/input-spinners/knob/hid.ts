// TEMPORARY: the cabinet's old USB HID spinners, while only the left one is a
// T-Knob. A player without a T-Knob gets the old spinner instead, speaking
// the knob's messages: ticks as it turns, and acks for everything that would
// change its feel, since it has no motor. Delete this file, and its few
// lines in hub.ts and index.ts, once both spinners are T-Knobs.

import type { Player } from "../clients/typescript/index.ts";
import { TURN, type DeviceCommand, type DeviceMessage, type Hello } from "./protocol.ts";
import { STEPS_PER_TURN } from "./steps.ts";

const UNITS_PER_STEP = TURN / STEPS_PER_TURN;
/** Turning slower than a step per this long reads as stopped. */
const STOPPED_MS = 100;

/** Opens the HID device; `report` gets each spinner's steps since the last report. */
export interface HidAccess {
    open(report: (steps: [number, number]) => void, lost: () => void): { close(): void } | undefined;
}

/** One old spinner, standing in for a T-Knob. */
export class HidSpinner {
    readonly identity: Hello;
    private units = 0;
    private lastMs?: number;

    constructor(player: Player, private now = () => performance.now()) {
        this.identity = { type: "hello", device: "rcade-spinner-hid", id: `hid-p${player}`, magnet: null, max_points: 0 };
    }

    /** It turned this many steps: a tick. */
    turn(steps: number): DeviceMessage {
        const now = this.now();
        const ms = this.lastMs === undefined ? Infinity : now - this.lastMs;
        this.lastMs = now;
        this.units += steps * UNITS_PER_STEP;
        // Units per second is also turns per second with 16 fractional bits.
        const velocity = ms < STOPPED_MS ? steps * UNITS_PER_STEP * 1000 / Math.max(ms, 1) : 0;
        return {
            type: "tick",
            angle: ((this.units % TURN) + TURN) % TURN,
            global_angle: this.units,
            curve_angle: this.units,
            velocity_q16: Math.round(velocity),
            time_us: Math.round(now * 1000),
        };
    }

    /** A game's command: tare works; everything else is acked and ignored. */
    handle(command: DeviceCommand & { id?: number }): DeviceMessage {
        if (command.type === "hello") return this.identity;
        if (command.type === "tare") this.units += command.global_angle - (command.reference ?? this.units);
        return { type: "ack", command: command.type, ...(command.id !== undefined ? { id: command.id } : {}), time_us: Math.round(this.now() * 1000) };
    }
}
