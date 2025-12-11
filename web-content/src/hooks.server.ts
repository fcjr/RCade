import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);

    // Allow iframing from any origin
    response.headers.delete('X-Frame-Options');
    response.headers.set('Content-Security-Policy', "frame-ancestors *");

    return response;
};