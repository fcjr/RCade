import type { RequestHandler } from "@sveltejs/kit";
import { Game } from "$lib/game";
import { env } from "$env/dynamic/private";
import { getGamesCacheKey } from "$lib/cache";

export const GET: RequestHandler = async ({ locals, request, platform }) => {
    const session = await locals.auth();

    const auth = session?.user ? { for: "recurser" as const, rc_id: session.user.rc_id } : request.headers.get("Authorization") == `Bearer ${env.CABINET_API_KEY}` ? { for: "cabinet" as const } : { for: "public" as const };

    // cache for cabinet and public (recurser responses vary per user)
    const cache = platform?.caches?.default;
    const cacheKey = auth.for !== "recurser" ? getGamesCacheKey(auth.for) : null;

    // Worker Cache API won't store responses with private/no-store headers,
    // so we cache without them but return to clients with them to prevent browser caching
    const noCacheHeaders = { 'Cache-Control': 'private, no-store' };

    if (cache && cacheKey) {
        const cached = await cache.match(cacheKey);
        if (cached) {
            // Return cached response with no-cache headers for browser
            const response = new Response(cached.body, cached);
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
        }
    }

    try {
        const games = (await Promise.all((await Game.all()).map(async game => await game.intoResponse(auth)))).filter(v => v !== undefined);
        const body = JSON.stringify(games);

        // Response for worker cache (no restrictive headers)
        const cacheResponse = new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

        if (cache && cacheKey) {
            await cache.put(cacheKey, cacheResponse.clone());
        }

        // Response for client (with no-cache headers)
        return new Response(body, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...noCacheHeaders
            }
        });
    } catch (error) {
        console.error('Database error:', error);

        return new Response(
            JSON.stringify({ error: 'Failed to fetch items' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};