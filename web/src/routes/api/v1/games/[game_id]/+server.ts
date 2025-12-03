import { env } from "$env/dynamic/private";
import { Game } from "$lib/game";
import type { RequestHandler } from "@sveltejs/kit";

const noCacheHeaders = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ locals, params, request }) => {
    const session = await locals.auth();

    const auth = session?.user ? { for: <const>"recurser", rc_id: session.user.rc_id } : request.headers.get("Authorization") == `Bearer ${env.CABINET_API_KEY}` ? { for: <const>"cabinet" } : { for: <const>"public" };

    try {
        const game = await Game.byId(params.game_id ?? "");
        let response = undefined;

        if (game !== undefined) {
            response = await game.intoResponse(auth, { withR2Key: true });
        }

        if (response === undefined) {
            return new Response(
                JSON.stringify({ error: 'Game not found' }),
                { status: 404, headers: { 'Content-Type': 'application/json', ...noCacheHeaders } }
            );
        }

        return new Response(
            JSON.stringify(response),
            { status: 200, headers: { 'Content-Type': 'application/json', ...noCacheHeaders } }
        );
    } catch (error) {
        console.error('Database error:', error);

        return new Response(
            JSON.stringify({ error: 'Failed to fetch items' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};