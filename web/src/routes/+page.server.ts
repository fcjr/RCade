import type { PageServerLoad } from "./$types";
import { Game } from "$lib/game";

interface GameResponse {
	id: string;
	name: string;
	versions: Array<{
		displayName: string;
		description: string;
		visibility: string;
		version: string;
		categories: string[];
	}>;
}

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();

	// Build auth context
	const auth = session?.user
		? { for: "recurser" as const, rc_id: session.user.rc_id }
		: { for: "public" as const };

	// Get all games
	const allGames = await Game.all();

	// Convert to response format, filtering based on auth
	const games: GameResponse[] = [];

	for (const game of allGames) {
		const response = await game.intoResponse(auth);
		if (response) {
			games.push(response as GameResponse);
		}
	}

	// Sort by name
	games.sort((a, b) => {
		const nameA =
			a.versions[0]?.displayName?.toLowerCase() || a.name.toLowerCase();
		const nameB =
			b.versions[0]?.displayName?.toLowerCase() || b.name.toLowerCase();
		return nameA.localeCompare(nameB);
	});

	return {
		games,
		session,
	};
};
