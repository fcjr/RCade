import pako from "pako";
import untar from "js-untar";

export interface CacheableFile {
	body: string | ArrayBuffer;
	contentType: string;
}

export interface GameFiles {
	files: Record<string, CacheableFile>;
}

const storageBlockerScript = `<script>
(function() {
  var blocked = { localStorage: 1, sessionStorage: 1, indexedDB: 1, caches: 1 };
  for (var k in blocked) {
    Object.defineProperty(window, k, {
      get: function() { throw new DOMException(k + ' is disabled', 'SecurityError'); },
      configurable: false
    });
  }
  Object.defineProperty(document, 'cookie', {
    get: function() { return ''; },
    set: function() { throw new DOMException('Cookies are disabled', 'SecurityError'); },
    configurable: false
  });
  var blockedEvents = [
    'keydown', 'keyup', 'keypress', 'click', 'dblclick', 'mousedown', 'mouseup',
    'mousemove', 'mouseenter', 'mouseleave', 'mouseover', 'mouseout', 'contextmenu',
    'wheel', 'scroll', 'touchstart', 'touchend', 'touchmove', 'touchcancel',
    'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave',
    'pointerover', 'pointerout', 'pointercancel'
  ];
  var orig = document.addEventListener.bind(document);
  document.addEventListener = function(type, listener, options) {
    if (blockedEvents.indexOf(type) !== -1) {
      throw new DOMException('document.addEventListener("' + type + '") is disabled. Use the input plugin.', 'SecurityError');
    }
    return orig(type, listener, options);
  };
})();
</script>`;

const MIME_TYPES: Record<string, string> = {
	html: "text/html",
	htm: "text/html",
	js: "application/javascript",
	mjs: "application/javascript",
	css: "text/css",
	json: "application/json",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	wasm: "application/wasm",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	ico: "image/x-icon",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	mp4: "video/mp4",
	webm: "video/webm",
	txt: "text/plain",
	xml: "application/xml",
};

const TEXT_EXTENSIONS = new Set([
	"html",
	"htm",
	"js",
	"mjs",
	"css",
	"json",
	"svg",
	"txt",
	"xml",
]);

function getExt(filename: string): string {
	return filename.split(".").pop()?.toLowerCase() || "";
}

function injectSecurityScript(html: string): string {
	if (html.includes("<head>")) {
		return html.replace("<head>", "<head>" + storageBlockerScript);
	}
	if (html.includes("<html>")) {
		return html.replace("<html>", "<html><head>" + storageBlockerScript + "</head>");
	}
	return storageBlockerScript + html;
}

interface TarFile {
	name: string;
	buffer: ArrayBuffer;
}

export async function loadGame(contentUrl: string): Promise<GameFiles> {
	const response = await fetch(contentUrl);
	if (!response.ok) {
		throw new Error(`Failed to download game: ${response.statusText}`);
	}

	const compressedData = await response.arrayBuffer();
	const decompressed = pako.inflate(new Uint8Array(compressedData));
	const tarFiles: TarFile[] = await untar(decompressed.buffer);

	const files: Record<string, CacheableFile> = {};

	for (const file of tarFiles) {
		if (!file.buffer || file.buffer.byteLength === 0) continue;

		// Normalize path - strip leading directory wrapper
		let filePath = file.name;
		const parts = filePath.split("/");
		if (parts.length > 1 && parts[0] !== "") {
			filePath = "/" + parts.slice(1).join("/");
		}
		if (!filePath.startsWith("/")) filePath = "/" + filePath;
		if (filePath === "/") continue;

		const ext = getExt(filePath);
		const contentType = MIME_TYPES[ext] || "application/octet-stream";

		if (TEXT_EXTENSIONS.has(ext)) {
			let content = new TextDecoder("utf-8").decode(file.buffer);
			if (ext === "html" || ext === "htm") {
				content = injectSecurityScript(content);
			}
			files[filePath] = { body: content, contentType };
		} else {
			files[filePath] = { body: file.buffer, contentType };
		}
	}

	return { files };
}

export async function registerGameServiceWorker(): Promise<ServiceWorkerRegistration> {
	if (!("serviceWorker" in navigator)) {
		throw new Error("Service Workers not supported");
	}

	const registration = await navigator.serviceWorker.register("/service-worker.js", {
		scope: "/",
	});

	if (registration.installing) {
		await new Promise<void>((resolve) => {
			registration.installing!.addEventListener("statechange", (e) => {
				if ((e.target as ServiceWorker).state === "activated") resolve();
			});
		});
	}

	return registration;
}

function rewriteAbsolutePaths(content: string, gameId: string): string {
	const base = `/games/cache/${gameId}/`;
	return content
		.replace(/src="\//g, `src="${base}`)
		.replace(/src='\//g, `src='${base}`)
		.replace(/href="\//g, `href="${base}`)
		.replace(/href='\//g, `href='${base}`)
		.replace(/fetch\("\//g, `fetch("${base}`)
		.replace(/fetch\('\//g, `fetch('${base}`)
		.replace(/import\("\//g, `import("${base}`)
		.replace(/import\('\//g, `import('${base}`)
		.replace(
			/([=(\s,])(["'])\/([a-zA-Z0-9_-]+\.(wasm|js|mjs|css|png|jpg|jpeg|gif|svg|json|mp3|wav|ogg))\2/g,
			`$1$2${base}$3$2`
		);
}

export async function cacheGameFiles(
	gameId: string,
	{ files }: GameFiles,
	registration: ServiceWorkerRegistration
): Promise<void> {
	if (!registration.active) {
		throw new Error("No active service worker");
	}

	const serializableFiles: Record<string, CacheableFile> = {};

	for (const [path, file] of Object.entries(files)) {
		let body = file.body;
		if (typeof body === "string" && /\.(html?|m?js)$/.test(path)) {
			body = rewriteAbsolutePaths(body, gameId);
		}
		serializableFiles[path] = { body, contentType: file.contentType };
	}

	const sendMessage = (msg: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
		new Promise((resolve) => {
			const channel = new MessageChannel();
			channel.port1.onmessage = (e) => resolve(e.data);
			registration.active!.postMessage(msg, [channel.port2]);
		});

	await sendMessage({ type: "CLEAR_GAME", gameId });
	const result = await sendMessage({ type: "CACHE_GAME", gameId, files: serializableFiles });
	if (!result.success) {
		throw new Error(`Failed to cache game: ${result.error}`);
	}
}

export function getGameCacheUrl(gameId: string): string {
	return `/games/cache/${gameId}/index.html`;
}
