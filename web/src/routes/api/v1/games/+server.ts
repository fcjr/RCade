import type { RequestHandler } from "@sveltejs/kit";
import { Game } from "$lib/game";

export const GET: RequestHandler = async (event) => {
    const session = await event.locals.auth();

    const auth = session?.user ? { for: <const>"recurser", rc_id: session.user.rc_id } : { for: <const>"public" };

    try {
        return new Response(
            JSON.stringify((await Game.all_latest()).map(game => game.intoResponse(auth)).filter(v => v !== undefined)),
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