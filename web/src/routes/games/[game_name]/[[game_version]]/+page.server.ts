import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, params }) => {
    const response = await fetch('/api/v1/games/by-name/' + encodeURIComponent(params.game_name));

    if (!response.ok) {
        if (response.status === 404) {
            error(404, 'Game not found');
        }
        error(response.status, `Failed to fetch game`);
    }

    const game = await response.json();

    const version = (params as any).game_version ?? null;

    return {
        game,
        version,
    };
};