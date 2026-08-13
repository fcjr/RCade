import { take, type MarqueeHandle } from "@rcade/plugin-marquee";
import catGif from "$lib/assets/cat.gif?inline";

const WIDTH = 128;
const HEIGHT = 32;
const MIN_FRAME_MS = 20;
const DEFAULT_FRAME_MS = 100;

type Frame = { pixels: Uint8Array; durationMs: number };

async function decodeGifFrames(): Promise<Frame[]> {
    const buf = await (await fetch(catGif)).arrayBuffer();
    const decoder = new ImageDecoder({ data: buf, type: "image/gif" });
    await decoder.tracks.ready;
    const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 1;

    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d canvas context");

    const frames: Frame[] = [];
    for (let i = 0; i < frameCount; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);
        const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);
        const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
        for (let p = 0; p < WIDTH * HEIGHT; p++) {
            pixels[p * 3 + 0] = data[p * 4 + 0];
            pixels[p * 3 + 1] = data[p * 4 + 1];
            pixels[p * 3 + 2] = data[p * 4 + 2];
        }
        // VideoFrame durations are in microseconds; 0/undefined means "unspecified".
        const durationMs = image.duration ? image.duration / 1000 : DEFAULT_FRAME_MS;
        image.close();
        frames.push({ pixels, durationMs: Math.max(durationMs, MIN_FRAME_MS) });
    }
    decoder.close();
    return frames;
}

export function startMarquee(): () => void {
    let handle: MarqueeHandle | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    (async () => {
        try {
            const [h, frames] = await Promise.all([take(), decodeGifFrames()]);
            handle = h;
            if (stopped || frames.length === 0) return;
            let i = 0;
            const tick = () => {
                if (stopped) return;
                const frame = frames[i];
                handle?.apply(frame.pixels);
                i = (i + 1) % frames.length;
                timer = setTimeout(tick, frame.durationMs);
            };
            tick();
        } catch (e) {
            console.error("[menu/marquee] failed to start marquee:", e);
        }
    })();

    return () => {
        stopped = true;
        if (timer !== undefined) clearTimeout(timer);
    };
}
