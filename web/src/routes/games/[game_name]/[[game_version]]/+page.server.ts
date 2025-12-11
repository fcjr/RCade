import type { PageServerLoad } from '../$types';

export const load: PageServerLoad = async ({ fetch, params }) => {
    const response = await fetch('/api/v1/games/by-name/' + encodeURIComponent(params.game_name));

    if (!response.ok) {
        throw new Error(`Failed to fetch game: ${response.status}`);
    }

    const game = await response.json();

    const version = (params as any).game_version ?? null;

    return {
        game,
        version,
    };
};