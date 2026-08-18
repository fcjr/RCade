import type { Plugin, PluginEnvironment } from "@rcade/sdk-plugin";
import WebSocket from "ws";

const MARQUEE_HOST = process.env["RCADE_MARQUEE_HOST"] ?? "ws://rcade-marquee.barn-micro.ts.net:8080";

const MSG_APPLY = 0x00;
const MSG_BRIGHTNESS = 0x01;

const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 5_000;
const PING_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 25_000;

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
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = RETRY_MIN_MS;
let heartbeat: ReturnType<typeof setInterval> | undefined;

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
    if (wsDims && (wsDims.w !== w || wsDims.h !== h)) closeWs();
    if (ws || retryTimer) return;
    wsDims = { w, h };
    connect();
}

// The marquee Pi may not be reachable when the cabinet starts (it is on a
// USB-ethernet link and gets its DHCP lease a few seconds after the menu
// mounts), and the display may still be held by a previous session (HTTP 409).
// Both are transient, so keep retrying for as long as something wants the
// display rather than giving up on the first failure.
function connect(): void {
    if (!wsDims || stack.length === 0) return;
    const url = `${MARQUEE_HOST}/take?w=${wsDims.w}&height=${wsDims.h}`;
    const local = new WebSocket(url);
    ws = local;

    local.on("open", () => {
        wsReady = true;
        retryDelay = RETRY_MIN_MS;
        startHeartbeat(local);
        replayTop();
    });
    local.on("close", () => {
        if (ws !== local) return;
        stopHeartbeat();
        ws = undefined;
        wsReady = false;
        scheduleReconnect();
    });
    // "error" is always followed by "close", which drives the reconnect.
    local.on("error", (e) => console.error("[@rcade/marquee] ws error:", e.message));
}

function scheduleReconnect(): void {
    if (retryTimer || stack.length === 0) return;
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
    }, delay);
    retryTimer.unref?.();
}

// A dropped link (unplugged USB ethernet, Pi reboot) leaves a half-open socket
// that never emits "close" on its own, so ping and hang up if pongs stop.
function startHeartbeat(local: WebSocket): void {
    stopHeartbeat();
    let lastPong = Date.now();
    local.on("pong", () => { lastPong = Date.now(); });
    heartbeat = setInterval(() => {
        if (Date.now() - lastPong > PONG_TIMEOUT_MS) {
            local.terminate();
            return;
        }
        try { local.ping(); } catch { /* closing */ }
    }, PING_INTERVAL_MS);
    heartbeat.unref?.();
}

function stopHeartbeat(): void {
    if (heartbeat === undefined) return;
    clearInterval(heartbeat);
    heartbeat = undefined;
}

function closeWs(): void {
    if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
    }
    stopHeartbeat();
    const local = ws;
    ws = undefined;
    wsReady = false;
    wsDims = undefined;
    retryDelay = RETRY_MIN_MS;
    local?.close();
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
    else blankTop();
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