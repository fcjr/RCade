import { sequence } from "@sveltejs/kit/hooks";
import { authHandle } from "$lib/auth";
import type { Handle } from "@sveltejs/kit";

const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Add headers for SharedArrayBuffer support (needed for WASM games)
	if (event.url.pathname.startsWith("/games/")) {
		response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
		response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
	}

	return response;
};

export const handle = sequence(authHandle, securityHeaders);