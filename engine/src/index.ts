import type { PluginProvider } from "./plugin/provider";

import { Logger, BrowserLogRenderer, type LogHandler, LogEntry } from "@rcade/log";
import { Client, Game } from "@rcade/api";

export type RCadeWebEngineConfig = {
    appUrl: string,
    cancellationToken?: AbortSignal,
    logger?: Logger,
}

export type ProgressReport = {
    state: "starting"
} | {
    state: "fetching"
} | {
    state: "downloading",
    progress: number,
    total?: number
} | {
    state: "opening",
} | {
    state: "clearing_cache",
    current: string,
    current_index: number,
    total: number,
} | {
    state: "unpacking",
} | {
    state: "caching",
    current: string,
    current_index: number,
    total: number,
} | {
    state: "finishing",
}

export class RCadeWebEngine {
    private static async move(logger: Logger, iframe: HTMLIFrameElement, resolved_url: string) {
        iframe.src = resolved_url;

        logger.debug("Moving iframe to", resolved_url);

        const hello = new Promise((resolve) => {
            const listener = (event: MessageEvent) => {
                if (event.data && event.data.type === "SW_PORT_READY") {
                    window.removeEventListener("message", listener);
                    resolve({ message: event.data.content, port: event.ports[0] });
                }
            };
            window.addEventListener("message", listener);
        });

        await new Promise((resolve, reject) => {
            const onLoad = () => {
                iframe.removeEventListener("load", onLoad);
                resolve(null);
            };
            iframe.addEventListener("load", onLoad);
        });

        logger.debug("Iframe moved to", resolved_url);

        logger.debug("Waiting for SW port...");

        const { message, port } = await hello as any;

        logger.debug("SW port acquired");

        port.start();

        return { message, port };
    }

    static async initialize(element: HTMLElement, config: Partial<RCadeWebEngineConfig> = {}) {
        const appUrl = new URL(config.appUrl ?? "https://usercontent.rcade.dev");
        const logger = (config.logger ?? Logger.create().withHandler(BrowserLogRenderer).withMinimumLevel("INFO")).withModule("RCadeEngine");

        appUrl.pathname = "/__rcade_blank";

        // create an iframe pointing to to appUrl
        const iframe = document.createElement("iframe");
        iframe.style.width = "336px";
        iframe.style.height = "262px";
        iframe.style.border = "none";
        iframe.allow = "camera";

        let loaded = this.move(logger, iframe, appUrl.toString());

        // mount the iframe to the element
        element.appendChild(iframe);

        // Set up cancellation handler
        const cleanup = () => {
            logger.warn("Initialize Cancelled");
            iframe.remove();
        };

        if (config.cancellationToken) {
            if (config.cancellationToken.aborted) {
                cleanup();
                throw new DOMException("Initialization was cancelled", "AbortError");
            }

            config.cancellationToken.addEventListener("abort", cleanup, { once: true });
        };

        const { message, port } = await loaded;

        if (config.cancellationToken) {
            config.cancellationToken.removeEventListener("abort", cleanup);
        }

        return new RCadeWebEngine(logger, iframe, message, port, appUrl, config.cancellationToken);
    }

    private port_listener: any;
    private window_listener: any;

    private constructor(
        private logger: Logger,
        private iframe: HTMLIFrameElement,
        private hello: any,
        private port: MessagePort,
        private appUrl: URL,
        cancellationToken?: AbortSignal
    ) {
        logger.info("Initialized");

        if (cancellationToken) {
            cancellationToken.addEventListener("abort", () => {
                this.dispose();
            }, { once: true });
        }

        this.port_listener = (event: MessageEvent) => {
            if (event.data && event.data.type === "SW_LOG") {
                logger.dispatch(LogEntry.fromLogObject(event.data.content));
                return
            }

            if (event.data && event.data.type === "DISPOSE_PORT") {
                this.dispose();
                return;
            }

            if (event.data && ["GAME_LOAD_PROGRESS", "GAME_LOADED", "GAME_LOAD_FAILED", "GAME_UNLOADED", "GAME_UNLOAD_FAILED"].includes(event.data.type)) {
                return;
            }

            logger.warn("Received unknown port message:", event.data);
        };

        this.window_listener = (event: MessageEvent) => {
            if (event.source !== iframe.contentWindow) {
                logger.info("Ignoring message with incorrect source:", event.data);
                return;
            }

            if (event.data && event.data.type === "WIN_LOG") {
                logger.withModule("iframe").dispatch(LogEntry.fromLogObject(event.data.content));
                return
            }

            if (event.data && ["SW_PORT_READY"].includes(event.data.type)) {
                return;
            }

            if (event.data && event.data.type === "PERMISSION_DENIED") {
                this.permissionDeniedHandler?.(event.data.permission);
                return;
            }

            if (event.data && event.data.type === "acquire_plugin_channel") {
                const nonce = event.data.nonce;
                const channel = event.data.channel;

                const acquire = logger.info("Attempting to acquire:", channel);

                const provider = this.plugins.get(channel.name);

                if (!provider) {
                    logger.because(acquire).error(`No plugin registered with name: ${channel.name}`);

                    this.iframe.contentWindow?.postMessage({
                        type: "plugin_channel",
                        nonce,
                        error: { message: `No plugin registered with name: ${channel.name}` },
                    }, "*");

                    return;
                }

                let pluginPort;

                try {
                    pluginPort = provider.getChannel(channel.version);
                } catch (err: any) {
                    if (Error.isError(err)) {
                        logger.dispatch(LogEntry.fromErrorWithCause(acquire, err));
                    } else {
                        logger.because(acquire).error(err);
                    }

                    this.iframe.contentWindow?.postMessage({
                        type: "plugin_channel",
                        nonce,
                        error: { message: String(err.message) },
                    }, "*");
                    return;
                }

                this.iframe.contentWindow?.postMessage({
                    type: "plugin_channel",
                    nonce,
                    channel: { name: pluginPort.name, version: pluginPort.version },
                }, "*", [pluginPort.channel]);

                return;
            }

            logger.warn("Received unknown window message:", event.data);
        };

        port.addEventListener("message", this.port_listener);
        window.addEventListener("message", this.window_listener);

        port.postMessage({ type: "LOG_START" })
    }

    private state: "idle" | "moving" | "loaded" | "error" = "idle";
    private permissionDeniedHandler?: (permission: string) => void;

    public onPermissionDenied(handler: (permission: string) => void) {
        this.permissionDeniedHandler = handler;
    }

    private dispose() {
        this.logger.info("Disposing");

        this.port.removeEventListener("message", this.port_listener);
        window.removeEventListener("message", this.window_listener);

        this.port.postMessage({ type: "DISPOSE_PORT" });
        this.iframe.remove();
    }

    private waitFor(type: string, errorType?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const listener = (event: MessageEvent) => {
                if (event.data && event.data.type === type) {
                    this.port.removeEventListener("message", listener);
                    resolve(event.data.content);
                    return;
                }

                if (errorType !== undefined && event.data && event.data.type === errorType) {
                    this.port.removeEventListener("message", listener);
                    reject(event.data.content);
                    return;
                }
            };
            this.port.addEventListener("message", listener);
        });
    }

    private async moveTo(path: string) {
        const { message, port } = await RCadeWebEngine.move(this.logger, this.iframe, new URL(path, this.appUrl).toString());

        this.port = port;
        this.port.start();

        this.port.addEventListener("message", this.port_listener);

        this.port.postMessage({ type: "LOG_START" })

        return message;
    }

    private plugins: Map<string, PluginProvider> = new Map();

    public async register(provider: PluginProvider) {
        const name = provider.getChannelName();

        if (this.plugins.has(name)) {
            throw new Error(`Plugin for ${name} is already registered`);
        }

        this.plugins.set(name, provider);
    }

    public unregister(provider: PluginProvider) {
        const name = provider.getChannelName();
        this.plugins.delete(name);
    }

    public async load(game: Game, version: string | "latest", progressHandler?: (progress: ProgressReport) => void) {
        if (this.state !== "idle") {
            throw new Error(`Cannot load game while in state: ${this.state}`);
        }

        this.port.addEventListener("message", (event) => {
            if (event.data && event.data.type === "GAME_LOAD_PROGRESS") {
                progressHandler?.(event.data.content);
            }
        });

        this.state = "moving";
        this.port.postMessage({ type: "LOAD_GAME", content: { game: game.intoApiResponse(), version } });

        const response = await this.waitFor("GAME_LOADED", "GAME_LOAD_FAILED");

        progressHandler?.({ state: "finishing" });

        await this.moveTo("/index.html");
        this.state = "loaded";

        return response;
    }

    public async unload() {
        if (this.state === "idle") {
            return;
        }

        if (this.state !== "loaded") {
            throw new Error(`Cannot unload game while in state: ${this.state}`);
        }

        this.state = "moving";
        await this.moveTo("/__rcade_blank");

        this.port.postMessage({ type: "UNLOAD_GAME" });

        await this.waitFor("GAME_UNLOADED", "GAME_UNLOAD_FAILED");
        this.state = "idle";
    }
}