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

    if (cache && cacheKey) {
        const cached = await cache.match(cacheKey);
        if (cached) {
            return cached;
        }
    }

    try {
        const games = (await Promise.all((await Game.all()).map(async game => await game.intoResponse(auth)))).filter(v => v !== undefined);
        const body = JSON.stringify(games);

        const response = new Response(body, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 's-maxage=31536000'
            }
        });

        if (cache && cacheKey) {
            await cache.put(cacheKey, response.clone());
        }

        return response;
    } catch (error) {
        console.error('Database error:', error);

        return new Response(
            JSON.stringify({ error: 'Failed to fetch items' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};