import { env } from '$env/dynamic/private';
import { Game } from '$lib/game';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, locals, request }) => {
    const session = await locals.auth();

    const auth = session?.user ? { for: "recurser" as const, rc_id: session.user.rc_id } : request.headers.get("Authorization") == `Bearer ${env.CABINET_API_KEY}` ? { for: "cabinet" as const } : { for: "public" as const };
    const games = (await Promise.all((await Game.all()).map(async game => await game.intoResponse(auth, { withR2Key: true })))).filter(v => v !== undefined);

    return {
        games
    };
};