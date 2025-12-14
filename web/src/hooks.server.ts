import { authHandle } from "$lib/auth";
import type { Handle } from "@sveltejs/kit";
import { sequence } from '@sveltejs/kit/hooks';

const corsHandle: Handle = async ({ event, resolve }) => {
    // Apply CORS headers for usercontent.rcade.dev
    if (event.request.headers.get('origin') === 'https://usercontent.rcade.dev') {
        // Handle preflight requests
        if (event.request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': 'https://usercontent.rcade.dev',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Max-Age': '86400',
                }
            });
        }
    }

    const response = await resolve(event);

    // Add CORS headers to actual requests
    if (event.request.headers.get('origin') === 'https://usercontent.rcade.dev') {
        response.headers.set('Access-Control-Allow-Origin', 'https://usercontent.rcade.dev');
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    // Cross-Origin policies for SharedArrayBuffer support (required for WASM threading in iframed games)
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

    return response;
};

export const handle = sequence(corsHandle, authHandle);