import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Allow iframing from any origin
  response.headers.delete("X-Frame-Options");
  response.headers.set("Content-Security-Policy", "frame-ancestors *");

  // Allow any origin to access this page via CORS
  response.headers.set("Access-Control-Allow-Origin", "*");

  // Allow credentials if needed (note: can't use with wildcard origin)
  // If you need credentials, you'd have to dynamically set the origin
  // response.headers.set('Access-Control-Allow-Credentials', 'true');

  // Allow common HTTP methods
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );

  // Allow common headers
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Required for SharedArrayBuffer
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  response.headers.set("Cross-Origin-Resource-Policy", "cross-origin");

  return response;
};