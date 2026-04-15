import { take, type MarqueeHandle } from "@rcade/plugin-marquee";

const WIDTH = 128;
const HEIGHT = 32;
const FPS = 30;

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60)       [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else              [r, g, b] = [c, 0, x];
    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255),
    ];
}

export function startTestPattern(): () => void {
    const frame = new Uint8Array(WIDTH * HEIGHT * 3);
    let handle: MarqueeHandle | undefined;
    let raf: number | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    const render = (t: number) => {
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                const hue = ((x / WIDTH) * 360 + t * 60) % 360;
                const [r, g, b] = hsvToRgb(hue, 1, 1);
                const o = (y * WIDTH + x) * 3;
                frame[o + 0] = r;
                frame[o + 1] = g;
                frame[o + 2] = b;
            }
        }
        handle?.apply(frame);
    };

    (async () => {
        try {
            handle = await take();
            if (stopped) return;
            handle.setBrightness(0.8);
            const start = performance.now();
            timer = setInterval(() => {
                const t = (performance.now() - start) / 1000;
                render(t);
            }, 1000 / FPS);
        } catch (e) {
            console.error("[menu/marquee] failed to take marquee:", e);
        }
    })();

    return () => {
        stopped = true;
        if (timer !== undefined) clearInterval(timer);
        if (raf !== undefined) cancelAnimationFrame(raf);
    };
}
