import { PluginChannel } from "@rcade/sdk";

export type MarqueeConfig = {
    /** Width of frames this game will send, in pixels. */
    width: number;
    /** Height of frames this game will send, in pixels. */
    height: number;
};

export class MarqueeHandle {
    constructor(
        private channel: PluginChannel,
        public readonly width: number,
        public readonly height: number,
    ) { }

    /**
     * Push a frame to the marquee. `frame` must be `width * height * 3` bytes
     * of raw RGB pixel data (row-major, no padding).
     *
     * If another game has taken the marquee after this one, the frame is held
     * by the plugin and displayed when this game becomes top of the stack again.
     */
    apply(frame: Uint8Array): void {
        const expected = this.width * this.height * 3;
        if (frame.length !== expected) {
            throw new Error(`marquee.apply: expected ${expected} bytes (${this.width}x${this.height}x3), got ${frame.length}`);
        }
        this.channel.getPort().postMessage({ type: "apply", frame });
    }

    /**
     * Set the display brightness. `value` is 0..=1 (0 off, 1 max).
     */
    setBrightness(value: number): void {
        const clamped = Math.max(0, Math.min(1, value));
        const v = Math.round(clamped * 255);
        this.channel.getPort().postMessage({ type: "brightness", value: v });
    }
}

let acquired: Promise<PluginChannel> | undefined;

function getChannel(): Promise<PluginChannel> {
    if (!acquired) acquired = PluginChannel.acquire("@rcade/marquee", "^1.0.0");
    return acquired!;
}

const MARQUEE_WIDTH = 128;
const MARQUEE_HEIGHT = 32;

let taken = false;

/**
 * Take the marquee display for this game.
 *
 * The marquee is a stack — the most recent caller is on top. When your game
 * exits, its entry is automatically dropped and the next game below resumes.
 *
 * May only be called once per game. Throws if called a second time.
 */
export async function take(): Promise<MarqueeHandle> {
    if (taken) throw new Error("marquee.take: already taken by this game");
    taken = true;
    const channel = await getChannel();
    channel.getPort().postMessage({ type: "take", width: MARQUEE_WIDTH, height: MARQUEE_HEIGHT });
    return new MarqueeHandle(channel, MARQUEE_WIDTH, MARQUEE_HEIGHT);
}

export const MARQUEE = { take };
