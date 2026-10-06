// The spinners, shared by both plugin versions: the real serial ports and
// HID device behind one `KnobHub`.

import HID from "node-hid";
import { SerialPort } from "serialport";
import type { HidAccess } from "./hid.ts";
import { KnobHub } from "./hub.ts";
import type { SerialConnection } from "./tknob.ts";

export type { Attachment } from "./hub.ts";
export type { PlayerMessage } from "./protocol.ts";

const TKNOB = { vendorId: "303a", productId: "1001" };
// TEMPORARY: the old spinners' HID controller.
const HID_SPINNERS = { vendorId: 0x1209, productId: 0x0001 };

function open(path: string): Promise<SerialConnection> {
    return new Promise((resolve, reject) => {
        const port = new SerialPort({ path, baudRate: 115_200, autoOpen: false, lock: true });
        // Opening failures may also emit an error before the knob's listeners exist.
        port.on("error", () => {});
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            reject(new Error(`Opening ${path} timed out`));
        }, 2_000);
        // In particular, do not call set({ dtr, rts }): it can reset Espressif USB devices.
        port.open((error) => {
            clearTimeout(timeout);
            if (timedOut) {
                if (port.isOpen) port.close(() => {});
                return;
            }
            if (error) reject(error);
            else resolve(port);
        });
    });
}

/** node-hid's native part didn't load (as in a bundled dev cabinet): don't try again. */
let hidMissing = false;

const hid: HidAccess = {
    open(report, lost) {
        if (hidMissing) return;
        try {
            if (!HID.devices(HID_SPINNERS.vendorId, HID_SPINNERS.productId).length) return;
        } catch (error) {
            hidMissing = true;
            console.error("[input-spinners] The old HID spinner can't be read:", error instanceof Error ? error.message.split("\n")[0] : error);
            return;
        }
        try {
            const device = new HID.HID(HID_SPINNERS.vendorId, HID_SPINNERS.productId);
            // Each report: both spinners' steps since the last, as int16 LE.
            device.on("data", (data: Buffer) => {
                if (data.length >= 4) report([data.readInt16LE(0), data.readInt16LE(2)]);
            });
            device.on("error", (error: Error) => {
                console.error("[input-spinners] HID spinner error:", error);
                device.close();
                lost();
            });
            return { close: () => device.close() };
        } catch (error) {
            console.error("[input-spinners] HID spinner didn't open:", error);
        }
    },
};

/** Fresh knobs for a game, and the menu kept off them until the returned
 *  release, whether or not the game uses them. */
export function holdForGame(): () => Promise<void> {
    const attachment = knobs().attach(() => {});
    return () => attachment.detach();
}

let shared: KnobHub | undefined;

/** The one hub, made on first use. */
export function knobs(): KnobHub {
    return shared ??= new KnobHub({
        async paths() {
            // RCADE_TKNOB_PORT: comma-separated ports to use instead of searching.
            const selected = process.env.RCADE_TKNOB_PORT?.split(",").map(path => path.trim()).filter(Boolean);
            if (selected?.length) return selected;
            return (await SerialPort.list())
                .filter(({ vendorId, productId }) => vendorId?.toLowerCase() === TKNOB.vendorId && productId?.toLowerCase() === TKNOB.productId)
                .map(({ path }) => path)
                .sort();
        },
        open,
    }, {
        // Pin knobs to players by their ID (the `id` in hello, e.g. 40-4c-ca-5c-3c-24).
        seats: { p1: process.env.RCADE_TKNOB_P1?.trim() || undefined, p2: process.env.RCADE_TKNOB_P2?.trim() || undefined },
        hid,
    });
}

/** Calls `moved` whenever a tick shows a spinner turned: for the cabinet's
 *  idle timer. */
export function whenMoved(moved: () => void): (message: { type: string; player?: number; global_angle?: number }) => void {
    const last = new Map<number | undefined, number>();
    return message => {
        if (message.type !== "tick") return;
        const before = last.get(message.player);
        last.set(message.player, message.global_angle!);
        if (before !== undefined && before !== message.global_angle) moved();
    };
}
