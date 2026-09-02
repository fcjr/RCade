import type { Plugin, PluginEnvironment } from "@rcade/sdk-plugin";

// Mirrors `ScreensaverConfig` in clients/typescript. Kept local because that
// package acquires a channel on import, which only works inside a game frame.
type ScreensaverConfig = {
    transparent?: boolean;
    visible?: boolean;
    timeBeforeActive?: number;
    timeBeforeForcedExit?: number;
};

const CONFIG_KEYS = ["transparent", "visible", "timeBeforeActive", "timeBeforeForcedExit"] as const;

// One entry per live plugin instance, in start order. The menu's entry sits at
// the bottom for the cabinet's lifetime; a game's entry sits above it and is
// removed when the game stops, so nothing a game sets can outlive the game.
// The renderer applies the merged result on top of its own defaults.
const stack: ScreensaverConfig[] = [];

function effectiveConfig(): ScreensaverConfig {
    return Object.assign({}, ...stack);
}

function applyMessageConfig(entry: ScreensaverConfig, config: unknown): void {
    if (typeof config !== "object" || config === null) return;
    for (const key of CONFIG_KEYS) {
        if (!Object.hasOwn(config, key)) continue;
        const value = (config as Record<string, unknown>)[key];
        if (value !== undefined) (entry as Record<string, unknown>)[key] = value;
    }
}

export default class PluginSleep implements Plugin {
    private environment?: PluginEnvironment;
    private entry?: ScreensaverConfig;
    private startHandler: any;
    private stopHandler: any;

    start(environment: PluginEnvironment): void {
        this.environment = environment;
        const port = environment.getPort();
        const webContents = environment.getWebContents();

        this.entry = {};
        stack.push(this.entry);

        port.start();
        port.addListener("message", event => {
            const message = event.data;
            if (message?.type === "prevent_sleep") {
                webContents.send("input-activity");
            }
            if (message?.type === "update_screensaver" && this.entry) {
                applyMessageConfig(this.entry, message.config);
                this.publish();
            }
        });
        // @ts-ignore - MessagePortMain emits "close" when the remote end closes/GCs.
        port.addListener("close", () => this.drop());

        // @ts-ignore
        webContents.ipc.addListener("screensaver-started", this.startHandler = () => {
            port.postMessage({ type: "screensaver_started" });
        });
        // @ts-ignore
        webContents.ipc.addListener("screensaver-stopped", this.stopHandler = () => {
            port.postMessage({ type: "screensaver_stopped" });
        });
    }

    stop(): void {
        this.drop();
        this.environment?.getWebContents().ipc.removeListener("screensaver-started", this.startHandler);
        this.environment?.getWebContents().ipc.removeListener("screensaver-stopped", this.stopHandler);
    }

    private drop(): void {
        if (!this.entry) return;
        const index = stack.indexOf(this.entry);
        this.entry = undefined;
        if (index === -1) return;
        stack.splice(index, 1);
        this.publish();
    }

    private publish(): void {
        const webContents = this.environment?.getWebContents();
        if (!webContents || webContents.isDestroyed()) return;
        webContents.send("screensaver-config-changed", effectiveConfig());
    }
}
