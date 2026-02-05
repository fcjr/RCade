import { PluginChannel } from "@rcade/sdk";

/** 
 * Configures the screensaver's visuals and timers.
 * 
 * You should take care to avoid CRT burn-in when modifying these.
 */
export type ScreensaverConfig = {
    /** Whether the background of the screensaver will be visible. */
    transparent?: boolean,
    /** Whether the screensaver will be visible while it is active. */
    visible?: boolean,
    /**
     * The duration in milliseconds before the screensaver activates.
     * 
     * Setting this to Infinity will disable this timer.
     */
    timeBeforeActive?: number,
    /**
     * The duration in milliseconds before the app is terminated and returns to the menu
     * after the screensaver activates.
     * 
     * Setting this to Infinity will disable this timer.
     */
    timeBeforeForcedExit?: number,
};

let resolvers: (() => void)[] = [];
let channel: PluginChannel | undefined;
export function preventSleep() {
    channel?.getPort().postMessage({ type: "prevent_sleep" });
}

type ScreensaverEvents = {
    "started": void,
    "stopped": void
};

class Screensaver extends EventTarget {
    constructor() {
        super();
    }

    async updateScreensaver(config: ScreensaverConfig) {
        if (channel === undefined) await new Promise<void>(res => resolvers.push(res));


        channel?.getPort().postMessage({ type: "update_screensaver", config });
    }

    addEventListener<T extends keyof ScreensaverEvents>(type: T, listener: (evt: Event) => void, options?: AddEventListenerOptions): void {
        super.addEventListener(type, listener, options);
    }
    removeEventListener<T extends keyof ScreensaverEvents>(type: T, listener: (evt: Event) => void): void {
        super.removeEventListener(type, listener);
    }
}

export const SCREENSAVER: Screensaver = new Screensaver();

(async () => {
    channel = await PluginChannel.acquire("@rcade/sleep", "^1.0.0")!;
    for (const res of resolvers)
        res();

    channel?.getPort().addEventListener("message", (event: MessageEvent) => {
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
