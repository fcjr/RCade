import { PluginChannel } from "@rcade/sdk";

let channel: Promise<PluginChannel> | null = null;

(async () => {
    channel = PluginChannel.acquire("@rcade/menu", "^1.0.0");
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