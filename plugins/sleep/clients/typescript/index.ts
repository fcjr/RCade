import { PluginChannel } from "@rcade/sdk";

export type ScreensaverConfig = {
    transparent?: boolean,
    visible?: boolean,
};

let resolvers: (() => void)[] = [];
let channel: PluginChannel | undefined;
export function preventSleep() {
    channel?.getPort().postMessage({ type: "prevent_sleep" })
}

type ScreensaverEvents = {
    "started": void,
    "stopped": void
}

class Screensaver extends EventTarget {
    constructor() {
        super();
    }

    async updateScreensaver(config: ScreensaverConfig) {
        if (channel === undefined) await new Promise<void>(res => resolvers.push(res));

        channel?.getPort().postMessage({ type: "update_screensaver", config });
    }

    override addEventListener<T extends keyof ScreensaverEvents>(type: T, listener: (evt: Event) => void, options?: AddEventListenerOptions): void {
        super.addEventListener(type, listener, options);
    }

    override removeEventListener<T extends keyof ScreensaverEvents>(type: T, listener: (evt: Event) => void): void {
        super.removeEventListener(type, listener);
    }
}

export const SCREENSAVER: Screensaver = new Screensaver();

(async () => {
    channel = await PluginChannel.acquire("@rcade/sleep", "^1.0.0")!;
    for (const res of resolvers)
        res();

    channel?.getPort().addEventListener("message", (event: any) => {
        switch (event.data.type) {
            case "screensaver_started":
                SCREENSAVER.dispatchEvent(new Event("started"));
                break;
            case "screensaver_stopped":
                SCREENSAVER.dispatchEvent(new Event("stopped"));
                break;
        }
    })
})()

if (import.meta.hot) {
    import.meta.hot.accept(() => {
        (import.meta.hot as any).invalidate();
    });
}
