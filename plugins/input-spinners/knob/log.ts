import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Development log of all T-Knob serial traffic, one JSON object per line:
 *   {"t": <host ms>, "dir": "in" | "out", "msg": {...}}
 * Enabled by setting RCADE_TKNOB_LOG to a file path; otherwise does nothing.
 * Lines are appended synchronously, so a crash never loses what came before.
 */
const path = process.env.RCADE_TKNOB_LOG?.trim();
if (path) mkdirSync(dirname(path), { recursive: true });

export function logTraffic(dir: "in" | "out", msg: unknown): void {
    if (!path) return;
    try {
        appendFileSync(path, JSON.stringify({ t: Date.now(), dir, msg }) + "\n");
    } catch {
        // Logging must never break the bridge.
    }
}
