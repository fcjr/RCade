import type { PluginProvider } from "./plugin/provider";

export { type PluginProvider } from "./plugin/provider";

export type RCadeWebEngineConfig = {
    appUrl: string,
    cancellationToken?: AbortSignal,
}

const INIT_SCRIPT = `(async () => {
    // Initialize communication port with service worker
    const registration = await navigator.serviceWorker.ready;
    const sw = registration.active;
    const messageChannel = new MessageChannel();
    const hello = new Promise((resolve) => {
        const listener = (event) => {
            if (event.data && event.data.type === "PORT_INIT") {
                messageChannel.port1.removeEventListener("message", listener);
                resolve(event.data.content);
            }
        };

        messageChannel.port1.addEventListener("message", listener);
        messageChannel.port1.start();
    });

    sw.postMessage({ type: "INIT_PORT" }, [messageChannel.port2]);

    const content = await hello;

    window.parent.postMessage({ type: "SW_PORT_READY", content }, "*", [messageChannel.port1]);
})()`;

export class RCadeWebEngine {
    static async move(iframe: HTMLIFrameElement, resolved_url: string) {
        iframe.src = resolved_url;

        await new Promise((resolve, reject) => {
            const onLoad = () => {
                iframe.removeEventListener("load", onLoad);
                resolve(null);
            };
            iframe.addEventListener("load", onLoad);
        });

        const run: (code: string) => any = (iframe.contentWindow as any).eval;

        const hello = new Promise((resolve) => {
            const listener = (event: MessageEvent) => {
                if (event.data && event.data.type === "SW_PORT_READY") {
                    window.removeEventListener("message", listener);
                    resolve({ message: event.data.content, port: event.ports[0] });
                }
            };
            window.addEventListener("message", listener);
        });

        run(INIT_SCRIPT);

        const { message, port } = await hello as any;

        port.start();

        return { message, port };
    }

    static async initialize(element: HTMLElement, config: Partial<RCadeWebEngineConfig> = {}) {
        const appUrl = new URL(config.appUrl ?? "https://rcade-usercontent.recurse.com");

        appUrl.pathname = "/__rcade_blank";

        // create an iframe pointing to to appUrl
        const iframe = document.createElement("iframe");
        iframe.style.width = "336px";
        iframe.style.height = "262px";
        iframe.style.border = "none";

        let loaded = this.move(iframe, appUrl.toString());

        // mount the iframe to the element
        element.appendChild(iframe);

        // Set up cancellation handler
        const cleanup = () => {
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

        return new RCadeWebEngine(iframe, message, port, appUrl, config.cancellationToken);
    }

    private constructor(
        private iframe: HTMLIFrameElement,
        private hello: any,
        private port: MessagePort,
        private appUrl: URL,
        cancellationToken?: AbortSignal
    ) {
        if (cancellationToken) {
            cancellationToken.addEventListener("abort", () => {
                this.dispose();
            }, { once: true });
        }

        port.addEventListener("message", (event) => {
            if (event.data && event.data.type === "DISPOSE_PORT") {
                iframe.src = "/__rcade_blank";
                this.eval(`
                    document.body.innerHTML = "<h1>Service Worker Disposed</h1><p>The service worker has disposed the communication port. Please refresh the page to try again.</p>";
                    document.body.style.display = "flex";
                    document.body.style.flexDirection = "column";
                    document.body.style.justifyContent = "center";
                    document.body.style.alignItems = "center";
                    document.body.style.height = "100vh";
                    document.body.style.backgroundColor = "#f8d7da";
                    document.body.style.color = "#721c24";
                    document.body.style.fontFamily = "Arial, sans-serif";
                    document.body.style.textAlign = "center";
                    document.body.style.padding = "20px";
                `)
            }
        });

        window.addEventListener("message", (event) => {
            if (event.data && event.data.type === "acquire_plugin_channel") {
                const nonce = event.data.nonce;
                const channel = event.data.channel;

                const provider = this.plugins.get(channel.name);

                if (!provider) {
                    console.error(`No plugin registered with name: ${channel.name}`);

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
                    console.error(`Error acquiring plugin channel for ${channel.name}:`, err);

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
            }
        });
    }

    private state: "idle" | "moving" | "loaded" | "error" = "idle";

    private eval(code: string) {
        const run: (code: string) => any = (this.iframe.contentWindow as any).eval;
        return run(code);
    }

    private dispose() {
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
        const { message, port } = await RCadeWebEngine.move(this.iframe, new URL(path, this.appUrl).toString());

        this.port = port;
        this.port.start();

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

    public async load(gameId: string, version: string | "latest" = "latest") {
        if (this.state !== "idle") {
            throw new Error(`Cannot load game while in state: ${this.state}`);
        }

        this.state = "moving";
        this.port.postMessage({ type: "LOAD_GAME", content: { gameId, version } });

        const response = await this.waitFor("GAME_LOADED", "GAME_LOAD_FAILED");

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