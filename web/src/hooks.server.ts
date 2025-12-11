import { authHandle } from "$lib/auth";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

const corsHandle: Handle = async ({ event, resolve }) => {
    // Check if the request is for an API route
    if (event.url.pathname.startsWith('/api')) {
        const origin = event.request.headers.get('origin');

        // Check if origin is from localhost (any port)
        if (origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
            // Handle preflight requests
            if (event.request.method === 'OPTIONS') {
                return new Response(null, {
                    headers: {
                        'Access-Control-Allow-Origin': origin,
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                        'Access-Control-Max-Age': '86400',
                    }
                });
            }
        }
    }

    const response = await resolve(event);

    // Add CORS headers to actual requests
    if (event.url.pathname.startsWith('/api')) {
        const origin = event.request.headers.get('origin');
        if (origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
            response.headers.set('Access-Control-Allow-Origin', origin);
            response.headers.set('Access-Control-Allow-Credentials', 'true');
        }
    }

    return response;
};

export const handle = sequence(corsHandle, authHandle);