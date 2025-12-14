import { authHandle } from "$lib/auth";
import { redirect, type Handle } from "@sveltejs/kit";
import { sequence } from '@sveltejs/kit/hooks';
import { env } from "$env/dynamic/private";

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

const devHandle: Handle = async ({ event, resolve }) => {
    if (env.USE_HOSTED_API === "true" && event.url.pathname.startsWith("/api")) {
        const rewriteUrl = event.url;
        rewriteUrl.protocol = "https";
        rewriteUrl.hostname = "rcade.dev";
        rewriteUrl.port = "";
        const newReq = new Request(rewriteUrl, event.request);
        return await fetch(newReq);
    }

    return await resolve(event);
};

export const handle = sequence(corsHandle, authHandle, devHandle);
