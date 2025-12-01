import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { Game } from "$lib/game";

export const load: PageServerLoad = async ({ params, locals }) => {
	const session = await locals.auth();
	const game = await Game.byName(params.game_name);

	if (!game) {
		throw redirect(302, "/");
	}

	const auth = session?.user
		? { for: "recurser" as const, rc_id: session.user.rc_id }
		: { for: "public" as const };

	const gameResponse = await game.intoResponse(auth, { withR2Key: true });

	if (!gameResponse) {
		if (!session?.user) {
			throw redirect(302, "/auth/signIn?callbackUrl=/games/" + params.game_name);
		}
		throw redirect(302, "/");
	}

	return {
		game: gameResponse as {
			id: string;
			name: string;
			versions: Array<{
				displayName: string;
				description: string;
				visibility: string;
				version: string;
				contents?: { url: string; expires: number };
			}>;
		},
		session,
	};
};
