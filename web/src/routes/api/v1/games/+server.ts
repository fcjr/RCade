import type { RequestHandler } from "@sveltejs/kit";
import { Game } from "$lib/game";
import { env } from "$env/dynamic/private";

export const GET: RequestHandler = async ({ locals, request }) => {
    const session = await locals.auth();

    const auth = session?.user ? { for: <const>"recurser", rc_id: session.user.rc_id } : request.headers.get("Authorization") == `Bearer ${env.CABINET_API_KEY}` ? { for: <const>"cabinet" } : { for: <const>"public" };

    try {
        return new Response(
            JSON.stringify((await Promise.all((await Game.all()).map(async game => await game.intoResponse(auth)))).filter(v => v !== undefined)),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Database error:', error);

        return new Response(
            JSON.stringify({ error: 'Failed to fetch items' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};