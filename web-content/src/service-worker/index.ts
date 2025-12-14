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

import { unpackTar } from "modern-tar";
import { ungzip } from "pako";
import { getMimeType } from "./mime";
import { read, remove, write } from "./persistence";
import { LogEntry, LogForwarder, Logger } from "@rcade/log"
import { Game } from "@rcade/api";
import { INJECT_SCRIPT } from "../lib/injection_script";

const DEV_MODE = false;
const forwarder = LogForwarder.withTimeout(2000);
const logger = Logger.create().withHandler(forwarder).withModule("ServiceWorker").withMinimumLevel("DEBUG");

(globalThis as any).logger = logger;

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

let currently_on_blank = false;

g.addEventListener("fetch", (event: FetchEvent) => {
    const handle = logger.debug("Handling `fetch` event: ", event.request.method, event.request.url, Object.fromEntries(event.request.headers.entries()))

    let url = new URL(event.request.url);

    if (DEV_MODE && determineDevUrl(url)) {
        logger.because(handle).debug("Ignored as a developer url");
        return;
    }

    if (currently_on_blank) {
        logger.because(handle).debug("Ignored because origin state is the blank page");
        return;
    }

    if (url.pathname.startsWith("/__rcade_blank")) {
        logger.because(handle).debug("Ignored because is the blank page");
        return;
    }

    try {
        let referrer = new URL(event.request.referrer);

        if (referrer.pathname.startsWith("/__rcade_blank")) {
            logger.because(handle).debug("Ignored because origin is the blank page");
            currently_on_blank = true;
            return;
        } else {
            currently_on_blank = false;
        }
    } catch (err) {
        if (Error.isError(err)) {
            logger.dispatch(LogEntry.fromErrorWithCause(handle, err).withLevel("DEBUG"));
        } else {
            logger.because(handle).debug(err)
        }
    }

    let responding: LogEntry = handle;

    try {
        return event.respondWith(
            read("CURRENT_GAME").then(async (data) => {
                if (data === undefined) {
                    return new Response("NO GAME LOADED", { status: 404 });
                }

                const CURRENT_GAME = JSON.parse(data) as [string, string];

                responding = logger.because(handle).debug(`Responding for ${CURRENT_GAME[0]} @ ${CURRENT_GAME[1]}`);

                const cache = await caches.open(`${CURRENT_GAME[0]}/${CURRENT_GAME[1]}`);
                const response = await cache.match(new URL(`https://${CURRENT_GAME[1]}.${CURRENT_GAME[0]}.rcade-game${url.pathname}`));

                if (!response) {
                    logger.because(responding).warn("Request for missing asset", url.pathname);
                    return new Response("ASSET MISSING", { status: 404 });
                }


                if (response.headers.get("Content-Type")?.toLowerCase().includes("text/html")) {
                    let patching = logger.because(responding).debug("Patching response");

                    try {
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
                    } catch (err) {
                        if (Error.isError(err)) {
                            logger.dispatch(LogEntry.fromErrorWithCause(patching, err));
                        } else {
                            logger.because(patching).error(err);
                        }

                        return new Response("PATCHING ERROR", { status: 500 });
                    }
                }

                return response;
            }).catch((err) => {
                if (Error.isError(err)) {
                    logger.dispatch(LogEntry.fromErrorWithCause(responding, err));
                } else {
                    logger.error(err);
                }

                return new Response("PATCHING ERROR", { status: 500 });
            })
        );
    } catch (err) {
        if (Error.isError(err)) {
            logger.dispatch(LogEntry.fromErrorWithCause(responding, err));
        } else {
            logger.because(responding).error(err);
        }
    }
});

let CURRENT_PORT: MessagePort | undefined = undefined;

g.addEventListener("message", async (event) => {
    if (event.data && event.data.type === "INIT_PORT") {
        const port: MessagePort = event.ports[0];

        if (CURRENT_PORT !== undefined) {
            CURRENT_PORT.postMessage({ type: "DISPOSE_PORT" });
            CURRENT_PORT.close();
        }

        port.start();

        CURRENT_PORT = port;

        port.addEventListener("message", handlePortMessage);
        port.postMessage({ type: "PORT_INIT", content: { game: JSON.parse((await read("CURRENT_GAME"))!) } });

        return;
    }

    logger.warn("Unknown global message", event.data);
});

function handlePortMessage(event: MessageEvent) {
    if (event.data && event.data.type === "DISPOSE_PORT") {
        CURRENT_PORT?.close();
        CURRENT_PORT = undefined;
        forwarder.setTarget(undefined);
        return;
    }

    if (event.data && event.data.type === "LOG_START") {
        let port = CURRENT_PORT!;
        forwarder.setTarget((msg) => {
            port.postMessage({ type: "SW_LOG", content: msg.toLogObject() })
        });

        return;
    }

    if (event.data && event.data.type === "LOAD_GAME") {
        const loading = logger.debug("Loading game", event.data.content);

        const { game, version } = event.data.content;

        loadGame(game, version, loading)
            .then(async ({ game_id, version, name }) => {
                currently_on_blank = false;
                await write("CURRENT_GAME", JSON.stringify([game_id, version, name]));
                CURRENT_PORT?.postMessage({ type: "GAME_LOADED", content: { game_id, version } });
                logger.because(loading).debug("Loaded game");
            })
            .catch((err) => {
                if (Error.isError(err)) {
                    logger.dispatch(LogEntry.fromErrorWithCause(loading, err));
                } else {
                    logger.because(loading).error(err);
                }

                CURRENT_PORT?.postMessage({ type: "GAME_LOAD_FAILED", content: err.message });
            });

        return;
    }

    if (event.data && event.data.type === "UNLOAD_GAME") {
        const unloading = logger.debug("Unloading");

        remove("CURRENT_GAME")
            .then(() => {
                CURRENT_PORT?.postMessage({ type: "GAME_UNLOADED" });
                logger.because(unloading).debug("Unloaded");
            })
            .catch((err) => {
                if (Error.isError(err)) {
                    logger.dispatch(LogEntry.fromErrorWithCause(unloading, err));
                } else {
                    logger.because(unloading).error(err);
                }

                CURRENT_PORT?.postMessage({ type: "GAME_UNLOAD_FAILED", content: err.message });
            });
        return;
    }

    logger.warn("Unknown port message", event.data);
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

export async function loadGame(gameData: any, version: string | "latest", loading: LogEntry) {
    announceProgress({ state: "starting" });

    const game = Game.fromApiResponse(gameData);
    loading = logger.because(loading).debug("Found game", game.name(), `(${game.id()})`);
    let ver;

    if (version === "latest") {
        ver = game.latest();
    } else {
        ver = game.versions().find(v => v.version() === version)
    }

    if (ver === undefined) {
        logger.because(loading).error(`Version ${version} not found.`);
        throw new Error(`Version ${version} not found`);
    }

    loading = logger.because(loading).debug(`Found version: ${ver.version()}`);

    const contentUrl = ver.contentUrl();

    if (contentUrl === undefined) {
        logger.because(loading).error(`No content url for this version`);
        throw new Error("No content URL for this version");
    }

    announceProgress({ state: "fetching" });

    loading = logger.because(loading).debug("fetching", contentUrl)

    const content = await fetch(contentUrl);
    const contentLength = content.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : undefined;

    loading = logger.because(loading).debug(`Downloading bundle with size`, content.headers.get('content-length'))

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
    const cache = await caches.open(`${game.id()}/${ver.version()}`);

    // Decompress gzip using pako (pure JS, Safari-compatible)
    const decompressedData = ungzip(compressedData);

    const cache_keys = await cache.keys();

    loading = logger.because(loading).debug(`Clearing cache`)
    for (const key of cache_keys) {
        logger.because(loading).debug(`Clearing`, key.url);
        announceProgress({
            state: "clearing_cache",
            current: key.url,
            current_index: cache_keys.indexOf(key) + 1,
            total: cache_keys.length,
        })
        await cache.delete(key);
    }

    loading = logger.because(loading).debug(`Unpacking tarball`)
    announceProgress({ state: "unpacking" });
    const entries = await unpackTar(decompressedData);

    loading = logger.because(loading).debug(`Found ${entries.length} files`);

    const file_count = entries.filter(entry => entry.header.type === "file").length;

    for (const entry of entries) {
        if (entry.header.type === "file") {
            const response = new Response((entry.data ?? new Uint8Array(0)) as any, {
                headers: { "Content-Type": getMimeType(entry.header.name) }
            });

            const path = resolveAbsolutePath(entry.header.name, "/", game.id(), ver.version());

            logger.because(loading).debug(`Caching`, path.toString());

            announceProgress({
                state: "caching",
                current: path.toString(),
                current_index: entries.indexOf(entry) + 1,
                total: file_count,
            });

            await cache.put(path, response);
        }
    }

    return { game_id: game.id(), version: ver.version(), name: game.name() };
}