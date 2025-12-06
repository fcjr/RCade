/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference types="serviceworker" />

const CACHE_PREFIX = "rcade-game-";

interface CacheableFile {
	body: string | ArrayBuffer;
	contentType: string;
}

interface CacheGameMessage {
	type: "CACHE_GAME";
	gameId: string;
	files: Record<string, CacheableFile>;
}

interface ClearGameMessage {
	type: "CLEAR_GAME";
	gameId: string;
}

type SWMessage = CacheGameMessage | ClearGameMessage;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e: ExtendableEvent) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event: FetchEvent) => {
	const url = new URL(event.request.url);
	if (url.pathname.startsWith("/games/cache/")) {
		event.respondWith(handleGameRequest(url));
	}
});

async function handleGameRequest(url: URL): Promise<Response> {
	const pathParts = url.pathname.replace("/games/cache/", "").split("/");
	const gameId = pathParts[0];
	const filePath = "/" + (pathParts.slice(1).join("/") || "index.html");

	const cache = await caches.open(CACHE_PREFIX + gameId);
	const cacheKey = new Request(url.origin + "/games/cache/" + gameId + filePath);

	let response = await cache.match(cacheKey);
	if (!response && filePath === "/") {
		response = await cache.match(
			new Request(url.origin + "/games/cache/" + gameId + "/index.html")
		);
	}

	return response || new Response("Not Found", { status: 404 });
}

self.addEventListener("message", async (event: ExtendableMessageEvent) => {
	const data = event.data as SWMessage;
	const reply = (msg: { success: boolean; error?: string }) =>
		event.ports?.[0]?.postMessage(msg);

	try {
		if (data.type === "CACHE_GAME") {
			const cache = await caches.open(CACHE_PREFIX + data.gameId);
			const origin = self.location.origin;

			for (const [path, content] of Object.entries(data.files)) {
				const response = new Response(content.body, {
					headers: {
						"Content-Type": content.contentType,
						"Cache-Control": "no-cache",
						"Cross-Origin-Opener-Policy": "same-origin",
						"Cross-Origin-Embedder-Policy": "require-corp",
					},
				});
				await cache.put(origin + "/games/cache/" + data.gameId + path, response);
			}
			reply({ success: true });
		} else if (data.type === "CLEAR_GAME") {
			await caches.delete(CACHE_PREFIX + data.gameId);
			reply({ success: true });
		}
	} catch (err) {
		reply({ success: false, error: err instanceof Error ? err.message : String(err) });
	}
});
