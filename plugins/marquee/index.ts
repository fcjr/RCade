import type { Plugin, PluginEnvironment } from "@rcade/sdk-plugin";
import WebSocket from "ws";

const MARQUEE_HOST = process.env["RCADE_MARQUEE_HOST"] ?? "ws://rcade-marquee.barn-micro.ts.net:8080";

const MSG_APPLY = 0x00;
const MSG_BRIGHTNESS = 0x01;

type Entry = {
    width: number;
    height: number;
    lastFrame?: Uint8Array;
    brightness?: number;
};

const stack: Entry[] = [];
let ws: WebSocket | undefined;
let wsReady = false;
let wsDims: { w: number; h: number } | undefined;

function top(): Entry | undefined {
    return stack[stack.length - 1];
}

function tlv(type: number, payload: Uint8Array): Buffer {
    const buf = Buffer.alloc(3 + payload.length);
    buf.writeUInt8(type, 0);
    buf.writeUInt16BE(payload.length, 1);
    buf.set(payload, 3);
    return buf;
}

function ensureWs(w: number, h: number): void {
    if (ws && wsDims && (wsDims.w !== w || wsDims.h !== h)) closeWs();
    if (ws) return;
    wsDims = { w, h };
    const url = `${MARQUEE_HOST}/take?w=${w}&height=${h}`;
    const local = new WebSocket(url);
    ws = local;
    local.on("open", () => { wsReady = true; replayTop(); });
    local.on("close", () => { if (ws === local) { ws = undefined; wsReady = false; } });
    local.on("error", (e) => console.error("[@rcade/marquee] ws error:", e.message));
}

function closeWs(): void {
    ws?.close();
    ws = undefined;
    wsReady = false;
    wsDims = undefined;
}

function sendFrame(frame: Uint8Array): void {
    if (!ws || !wsReady) return;
    ws.send(tlv(MSG_APPLY, frame));
}

function sendBrightness(value: number): void {
    if (!ws || !wsReady) return;
    ws.send(tlv(MSG_BRIGHTNESS, new Uint8Array([value & 0xff])));
}

function blankTop(): void {
    const t = top();
    if (!t) return;
    sendFrame(new Uint8Array(t.width * t.height * 3));
}

function replayTop(): void {
    const t = top();
    if (!t) return;
    if (t.brightness !== undefined) sendBrightness(t.brightness);
    if (t.lastFrame) sendFrame(t.lastFrame);
}

function pushEntry(entry: Entry): void {
    stack.push(entry);
    ensureWs(entry.width, entry.height);
    blankTop();
}

function removeEntry(entry: Entry): void {
    const idx = stack.indexOf(entry);
    if (idx === -1) return;
    const wasTop = idx === stack.length - 1;
    stack.splice(idx, 1);
    if (!wasTop) return;

    const t = top();
    if (!t) { closeWs(); return; }
    ensureWs(t.width, t.height);
    if (t.brightness !== undefined) sendBrightness(t.brightness);
    if (t.lastFrame) sendFrame(t.lastFrame);
    else blankTop();
}

export default class PluginMarquee implements Plugin {
    private entry?: Entry;

    start(environment: PluginEnvironment): void {
        const port = environment.getPort();
        port.start();

        port.addListener("message", (event) => {
            const msg = event.data;

            console.log("marq it", msg);

            switch (msg?.type) {
                case "take": {
                    if (this.entry) return;
                    this.entry = { width: msg.width, height: msg.height };
                    pushEntry(this.entry);
                    return;
                }
                case "apply": {
                    if (!this.entry) return;
                    const frame: Uint8Array = msg.frame instanceof Uint8Array
                        ? msg.frame
                        : new Uint8Array(msg.frame);
                    this.entry.lastFrame = frame;
                    if (top() === this.entry) sendFrame(frame);
                    return;
                }
                case "brightness": {
                    if (!this.entry) return;
                    this.entry.brightness = msg.value;
                    if (top() === this.entry) sendBrightness(msg.value);
                    return;
                }
            }
        });

        // @ts-ignore - MessagePortMain emits "close" when the remote end closes/GCs.
        port.addListener("close", () => this.drop());
    }

    stop(): void {
        this.drop();
    }

    private drop(): void {
        if (!this.entry) return;
        const e = this.entry;
        this.entry = undefined;
        removeEntry(e);
    }
}