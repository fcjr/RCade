import { PluginChannel, type QuitOptions } from "@rcade/sdk";

let channel: Promise<PluginChannel> | null = null;

(async () => {
    channel = PluginChannel.acquire("@rcade/menu", "^1.0.0");

    channel.then(channel => {
        channel.getPort().addEventListener("message", (event) => {
            if (event.data.type === "quit_game") {
                quitHandler?.(event.data.options);
            }
        })
    });
})();

export async function getGames(): Promise<any[]> {
    if (!channel) {
        throw new Error("Plugin channel not initialized");
    }

    const cha = await channel;
    const port = cha.getPort();

    port.start();

    return await new Promise<any[]>((resolve, reject) => {
        const nonce = crypto.randomUUID();

        const handleMessage = (event: MessageEvent) => {
            const { type, nonce: responseNonce, content } = event.data;

            if (responseNonce !== nonce) {
                return;
            }

            if (type === "games-response") {
                port.removeEventListener("message", handleMessage);
                resolve(content);
            } else if (type === "games-error") {
                port.removeEventListener("message", handleMessage);
                reject(new Error(content));
            }
        };
        port.addEventListener("message", handleMessage);
        port.postMessage({ type: "get-games", nonce, content: {} });
    });
}

export async function playGame(game: any, version: string): Promise<void> {
    if (!channel) {
        throw new Error("Plugin channel not initialized");
    }

    const cha = await channel;
    const port = cha.getPort();

    port.start();
    port.postMessage({ type: "play-game", content: { game, version } });
}

export async function getLastGame(): Promise<string | undefined> {
    if (!channel) {
        throw new Error("Plugin channel not initialized");
    }

    const cha = await channel;
    const port = cha.getPort();

    port.start();

    return await new Promise(res => {
        const nonce = crypto.randomUUID();

        const handleMessage = (event: MessageEvent) => {
            const { type, nonce: responseNonce, content } = event.data;

            if (responseNonce !== nonce) {
                return;
            }

            if (type == "last-game") {
                port.removeEventListener("message", handleMessage);
                res(content.lastGameId);
            }
        };
        port.addEventListener("message", handleMessage);
        port.postMessage({ type: "get-last-game", nonce, content: {} });
    });
}

let quitHandler: ((quitOptions: QuitOptions) => void) | undefined = undefined;
export function onGameQuit(handler: (quitOptions: QuitOptions) => void) {
    quitHandler = handler;
}
