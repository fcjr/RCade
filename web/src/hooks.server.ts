import { authHandle } from "$lib/auth";
import type { Handle } from "@sveltejs/kit";
import { sequence } from '@sveltejs/kit/hooks';

const domainRedirectHandle: Handle = async ({ event, resolve }) => {
    const host = event.request.headers.get('x-forwarded-host') ?? event.request.headers.get('host');
    if (host?.includes('rcade.recurse.com')) {
        const url = new URL(event.request.url);
        url.host = 'rcade.dev';
        return new Response(null, {
            status: 302,
            headers: { Location: url.toString() }
        });
    }
    return resolve(event);
};

const isolationHandle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);

    // Cross-origin isolation so game iframes get SharedArrayBuffer
    // (required by the Rust SDK's shared-memory plugin runner).
    // Every cross-origin subresource must be CORP/CORS-safe: thumbnails
    // are proxied same-origin, Google Fonts and usercontent.rcade.dev
    // already send Cross-Origin-Resource-Policy: cross-origin.
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

    return response;
};

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

    return response;
};

export const handle = sequence(domainRedirectHandle, isolationHandle, corsHandle, authHandle);