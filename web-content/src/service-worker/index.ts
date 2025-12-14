/// <reference lib="webworker" />

// Polyfill ReadableStream async iterator for Safari
// Must be done before any imports that might use it (specifically modern-tar)
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
    (ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* (this: ReadableStream) {
        const reader = this.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                yield value;
            }
        } finally {
            reader.releaseLock();
        }
    };
}

import { Client } from "@rcade/api";
import { unpackTar } from "modern-tar";
import { ungzip } from "pako";
import { getMimeType } from "./mime";
import { read, remove, write } from "./persistence";

const DEV_MODE = false;

const INJECT_SCRIPT = `
// Wrap getUserMedia to catch permission denials and notify parent
(function() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function(constraints) {
        try {
            return await original(constraints);
        } catch (err) {
            if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
                const permission = constraints?.video ? 'camera' : constraints?.audio ? 'microphone' : 'media';
                window.parent.postMessage({ type: "PERMISSION_DENIED", permission }, "*");
            }
            throw err;
        }
    };
})();

(async () => {
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
})();`;

function determineDevUrl(url: URL) {
    if (url.pathname.startsWith("/@fs"))
        return true;

    if (url.pathname.startsWith("/@id"))
        return true;

    if (url.pathname.startsWith("/@vite"))
        return true;

    if (url.pathname.startsWith("/.svelte-kit"))
        return true;

    if (url.pathname.startsWith("/src"))
        return true;

    if (url.pathname.startsWith("/node_modules"))
        return true;

    return url.searchParams.has("svelte")
}

let g: ServiceWorkerGlobalScope = self as unknown as ServiceWorkerGlobalScope;

const client = Client.new();
let currently_on_blank = false;

g.addEventListener("fetch", (event: FetchEvent) => {
    let url = new URL(event.request.url);

    if (DEV_MODE && determineDevUrl(url)) {
        return;
    }

    if (currently_on_blank)
        return;

    if (url.pathname.startsWith("/__rcade_blank"))
        return;

    try {
        let referrer = new URL(event.request.referrer);

        if (referrer.pathname.startsWith("/__rcade_blank")) {
            currently_on_blank = true;
        } else {
            currently_on_blank = false;
        }
    } catch (e) { }

    return event.respondWith(
        read("CURRENT_GAME").then(async (data) => {
            console.log("Fetching asset for", data, ":", url.pathname);

            const CURRENT_GAME = JSON.parse(data) as [string, string];
            const cache = await caches.open(`${CURRENT_GAME[0]}/${CURRENT_GAME[1]}`);
            const response = await cache.match(new URL(`https://${CURRENT_GAME[1]}.${CURRENT_GAME[0]}.rcade-game${url.pathname}`));

            if (!response) {
                return new Response("ASSET MISSING", { status: 404 });
            }

            if (response.headers.get("Content-Type")?.toLowerCase().includes("text/html")) {
                const html = await response.text();
                const scriptTag = `<script>${INJECT_SCRIPT}</script>`;

                let injectedHtml: string;
                if (/<head(\s[^>]*)?>|<head>/i.test(html)) {
                    // first try to insert after <head> tag
                    injectedHtml = html.replace(/<head(\s[^>]*)?>|<head>/i, (match) => match + scriptTag);
                } else if (/<html(\s[^>]*)?>|<html>/i.test(html)) {
                    // if <head>, insert after <html> tag
                    injectedHtml = html.replace(/<html(\s[^>]*)?>|<html>/i, (match) => match + scriptTag);
                } else {
                    // else if no <head> or <html>, prepend to document
                    injectedHtml = scriptTag + html;
                }

                return new Response(injectedHtml, {
                    headers: { "Content-Type": "text/html" }
                });
            }

            return response;
        }).catch(() => {
            return new Response("NO GAME LOADED", { status: 404 });
        })
    );
});

let CURRENT_PORT: MessagePort | undefined = undefined;

g.addEventListener("message", (event) => {
    if (event.data && event.data.type === "INIT_PORT") {
        const port: MessagePort = event.ports[0];

        if (CURRENT_PORT !== undefined) {
            CURRENT_PORT.postMessage({ type: "DISPOSE_PORT" });
            CURRENT_PORT.close();
        }

        port.start();

        CURRENT_PORT = port;

        port.addEventListener("message", handlePortMessage);
        port.postMessage({ type: "PORT_INIT", content: {} });
        return;
    }
});

function handlePortMessage(event: MessageEvent) {
    if (event.data && event.data.type === "DISPOSE_PORT") {
        CURRENT_PORT?.close();
        CURRENT_PORT = undefined;
        return;
    }

    if (event.data && event.data.type === "LOAD_GAME") {
        const { gameId, version } = event.data.content;

        console.log("Loading game", gameId, "version", version);

        loadGame(gameId, version)
            .then(async ({ game_id, version }) => {
                currently_on_blank = false;
                await write("CURRENT_GAME", JSON.stringify([game_id, version]));
                CURRENT_PORT?.postMessage({ type: "GAME_LOADED", content: { game_id, version } });
            })
            .catch((err) => {
                CURRENT_PORT?.postMessage({ type: "GAME_LOAD_FAILED", content: err.message });
            });

        return;
    }

    if (event.data && event.data.type === "UNLOAD_GAME") {
        remove("CURRENT_GAME")
            .then(() => {
                CURRENT_PORT?.postMessage({ type: "GAME_UNLOADED" });
            })
            .catch((err) => {
                CURRENT_PORT?.postMessage({ type: "GAME_UNLOAD_FAILED", content: err.message });
            });
        return;
    }
}

function resolveAbsolutePath(relativePath: string, basePath: string, game_id: string, version: string) {
    // Ensure basePath ends with a slash if it's a directory
    if (!basePath.endsWith('/')) {
        basePath += '/';
    }

    // Use the URL constructor to resolve the path
    // We need a valid base URL, so we'll use a dummy domain
    const baseUrl = new URL(basePath, `https://${version}.${game_id}.rcade-game`);
    const absoluteUrl = new URL(relativePath, baseUrl);

    // Return just the pathname (without the protocol and domain)
    return absoluteUrl;
}

type ProgressReport = {
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
}

function announceProgress(progress: ProgressReport) {
    if (CURRENT_PORT !== undefined)
        CURRENT_PORT.postMessage({ type: "GAME_LOAD_PROGRESS", content: progress });
}

export async function loadGame(game_id: string, version: string | "latest") {
    announceProgress({ state: "starting" });

    const game = await client.getGame(game_id);
    let ver;

    if (version === "latest") {
        ver = game.latest();
    } else {
        ver = game.versions().find(v => v.version() === version)
    }

    if (ver === undefined)
        throw new Error("Version not found");

    const contentUrl = ver.contentUrl();

    if (contentUrl === undefined)
        throw new Error("No content URL for this version");

    announceProgress({ state: "fetching" });

    const content = await fetch(contentUrl);
    const contentLength = content.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : undefined;

    let loaded = 0;
    const reader = content.body!.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        // Report progress
        const progress = total ? (loaded / total) * 100 : 0;
        announceProgress({ state: "downloading", progress, total });
    }

    // response is a .tar.gz - combine chunks into Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const compressedData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        compressedData.set(chunk, offset);
        offset += chunk.length;
    }

    announceProgress({ state: "opening" });
    const cache = await caches.open(`${game_id}/${ver.version()}`);

    // Decompress gzip using pako (pure JS, Safari-compatible)
    const decompressedData = ungzip(compressedData);

    const cache_keys = await cache.keys();

    for (const key of cache_keys) {
        announceProgress({
            state: "clearing_cache",
            current: key.url,
            current_index: cache_keys.indexOf(key) + 1,
            total: cache_keys.length,
        })
        await cache.delete(key);
    }

    announceProgress({ state: "unpacking" });
    const entries = await unpackTar(decompressedData);

    const file_count = entries.filter(entry => entry.header.type === "file").length;

    for (const entry of entries) {
        if (entry.header.type === "file") {
            const response = new Response(entry.data ?? new Uint8Array(0), {
                headers: { "Content-Type": getMimeType(entry.header.name) }
            });

            const path = resolveAbsolutePath(entry.header.name, "/", game_id, ver.version());

            announceProgress({
                state: "caching",
                current: path.toString(),
                current_index: entries.indexOf(entry) + 1,
                total: file_count,
            });
            await cache.put(path, response);
        }
    }

    return { game_id, version: ver.version() };
}