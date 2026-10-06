// The knob's own protocol (firmware/knob/PROTOCOL.md):
// what the cabinet may write to a knob, and checking what a knob says.

import type { Magnet, Player, WireCommand, WireConfig, WireCurve, WirePoint, WirePulse, WireSetting } from "../clients/typescript/index.ts";

/** A command as a knob takes it: no player, since each knob is one player. */
type ForKnob<C> = C extends unknown ? Omit<C, "player"> : never;

/** Everything the cabinet may write to a knob. */
export type DeviceCommand = ForKnob<WireCommand> | { type: "lease" };

export type Hello = {
    type: "hello";
    /** TEMPORARY: "rcade-spinner-hid" is the old right spinner (hid.ts). */
    device: "rcade-tknob" | "rcade-spinner-hid";
    id: string;
    magnet: Magnet | null;
    max_points: number;
};

/** What a knob says. */
export type DeviceMessage =
    | Hello
    | { type: "tick"; angle: number; global_angle: number; curve_angle: number; velocity_q16: number; time_us: number }
    | { type: "status"; reason: string }
    | { type: "ack"; command: string; id?: number; time_us: number }
    | { type: "error"; message: string; id?: number };

/** What the cabinet tells a game: a knob's message, or whether it's there. */
export type PlayerMessage =
    | (DeviceMessage & { player: Player })
    | { type: "connection"; player: Player; connected: boolean; message: string }
    | { type: "error"; player?: Player; message: string; id?: number };

/** Matches the firmware's line limit (core/src/protocol.rs). */
export const MAX_FRAME_BYTES = 65_536;
/** Matches core/src/curves.rs. */
export const MAX_POINTS = 130;
export const TURN = 65_536;

export function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function integer(value: unknown, min: number, max: number): value is number {
    return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

export const u16 = (value: unknown): value is number => integer(value, 0, 65_535);
export const u32 = (value: unknown): value is number => integer(value, 0, 2 ** 32 - 1);
export const i32 = (value: unknown): value is number => integer(value, -(2 ** 31), 2 ** 31 - 1);

/** Curve coordinates and targets stay within ±2^44 (core/src/curves.rs). */
const MAX_COORDINATE = 2 ** 44;
/** Matches core/src/effects.rs. */
const MAX_PULSES = 16;
const MAX_PULSE_MS = 5_000;

const coordinate = (value: unknown): value is number => integer(value, -MAX_COORDINATE, MAX_COORDINATE);

/** Targets are angles; the others are fractions of 65536. */
function settingValue(value: unknown, target: boolean): value is number {
    return target ? coordinate(value) : integer(value, 0, TURN - 1);
}

function curve(value: unknown, target: boolean): WireCurve | undefined {
    if (!record(value) || !Array.isArray(value.points) || value.points.length < 1 || value.points.length > MAX_POINTS) return;
    const { flat_before, flat_after } = value;
    if ((flat_before !== undefined && typeof flat_before !== "boolean") || (flat_after !== undefined && typeof flat_after !== "boolean")) return;
    const points: WirePoint[] = [];
    for (const point of value.points) {
        if (!record(point) || !coordinate(point.x) || !settingValue(point.y, target)) return;
        const previous = points[points.length - 1];
        if (previous && point.x < previous.x) return;
        if (points.length >= 2 && points[points.length - 2].x === point.x) return; // a jump is two points, not three
        const { x, y, in: incoming, out } = point;
        if ((incoming !== undefined && !settingValue(incoming, target)) || (out !== undefined && !settingValue(out, target))) return;
        points.push({ x, y, ...(incoming !== undefined ? { in: incoming } : {}), ...(out !== undefined ? { out } : {}) });
    }
    return { points, ...(flat_before ? { flat_before: true } : {}), ...(flat_after ? { flat_after: true } : {}) } as WireCurve;
}

/** A curve, or one number for the same everywhere. */
function setting(value: unknown, target: boolean): WireSetting | undefined {
    return typeof value === "number" ? (settingValue(value, target) ? value : undefined) : curve(value, target);
}

function pulses(value: unknown): WirePulse[] | undefined {
    if (!Array.isArray(value) || value.length > MAX_PULSES) return;
    const copy: WirePulse[] = [];
    for (const pulse of value) {
        if (!record(pulse) || !integer(pulse.delay_ms, 0, MAX_PULSE_MS) || !integer(pulse.duration_ms, 0, MAX_PULSE_MS) || !u16(pulse.intensity)) return;
        copy.push({ delay_ms: pulse.delay_ms, duration_ms: pulse.duration_ms, intensity: pulse.intensity });
    }
    return copy;
}

/** Whitelist and rebuild a game's command. Games may identify a knob,
 *  replace its curves, tare, reset, brake and rumble it; lease and the dev
 *  measurement commands never come from a game. */
export function gameCommand(value: unknown): WireCommand | undefined {
    if (!record(value) || (value.player !== 1 && value.player !== 2)) return;
    if (value.id !== undefined && !u32(value.id)) return;
    const player: Player = value.player;
    const base = { player, ...(value.id !== undefined ? { id: value.id as number } : {}) };
    switch (value.type) {
        case "hello":
        case "reset":
        case "brake":
            return { ...base, type: value.type };
        case "config": {
            if (!record(value.config)) return;
            const config = value.config;
            const target = setting(config.target, true);
            const [mass, tension, friction] = ["mass", "tension", "friction"].map(name => setting(config[name], false));
            if (target === undefined || mass === undefined || tension === undefined || friction === undefined) return;
            const checked: WireConfig = { target, mass, tension, friction };
            return { ...base, type: "config", config: checked };
        }
        case "tare": {
            const angle = value.global_angle ?? 0;
            const reference = value.reference;
            if (!Number.isSafeInteger(angle) || (reference !== undefined && !Number.isSafeInteger(reference))) return;
            return { ...base, type: "tare", global_angle: angle as number, ...(reference !== undefined ? { reference: reference as number } : {}) };
        }
        case "rumble": {
            const checked = pulses(value.pulses);
            return checked && { ...base, type: "rumble", pulses: checked };
        }
    }
}

/** A type `deviceMessage` reads: if it still rejects it, the firmware doesn't match. */
export function isDeviceMessageType(value: unknown): boolean {
    return record(value) && ["hello", "tick", "status", "ack", "error"].includes(value.type as string);
}

export function deviceMessage(value: unknown): DeviceMessage | undefined {
    if (!record(value)) return;
    const id = value.id === undefined || u32(value.id) ? (value.id as number | undefined) : null;
    switch (value.type) {
        case "hello": {
            const magnet = value.magnet;
            const magnetOk = magnet === null || (record(magnet) && integer(magnet.pole_pairs, 1, 255)
                && (magnet.direction === 1 || magnet.direction === -1) && u16(magnet.zero));
            if (value.device === "rcade-tknob"
                && typeof value.id === "string" && /^([0-9a-f]{2}-){5}[0-9a-f]{2}$/.test(value.id)
                && magnetOk && integer(value.max_points, 1, MAX_POINTS)) {
                return value as unknown as DeviceMessage;
            }
            return;
        }
        case "tick":
            if (u16(value.angle) && Number.isSafeInteger(value.global_angle) && Number.isSafeInteger(value.curve_angle) && i32(value.velocity_q16)
                && Number.isSafeInteger(value.time_us) && Number(value.time_us) >= 0) {
                return value as unknown as DeviceMessage;
            }
            return;
        case "status":
            if (typeof value.reason === "string") return { type: "status", reason: value.reason };
            return;
        case "ack":
            if (typeof value.command === "string" && id !== null && Number.isSafeInteger(value.time_us) && Number(value.time_us) >= 0) {
                return { type: "ack", command: value.command, ...(id !== undefined ? { id } : {}), time_us: value.time_us as number };
            }
            return;
        case "error":
            if (typeof value.message === "string" && id !== null) return { type: "error", message: value.message, ...(id !== undefined ? { id } : {}) };
            return;
    }
}

/** Fixed storage survives fragmented, combined, and arbitrarily long input lines. */
export class JsonLines {
    private buffer = Buffer.alloc(MAX_FRAME_BYTES);
    private length = 0;
    private discarding = false;

    constructor(private receive: (value: unknown) => void, private invalid: () => void) {}

    push(chunk: Uint8Array): void {
        for (const byte of chunk) {
            if (byte === 10) {
                if (!this.discarding && this.length > 0) {
                    try {
                        const value = JSON.parse(this.buffer.toString("utf8", 0, this.length));
                        this.receive(value);
                    } catch {
                        this.invalid();
                    }
                }
                this.length = 0;
                this.discarding = false;
            } else if (!this.discarding) {
                if (this.length === MAX_FRAME_BYTES) {
                    this.discarding = true;
                    this.length = 0;
                    this.invalid();
                } else {
                    this.buffer[this.length++] = byte;
                }
            }
        }
    }
}
