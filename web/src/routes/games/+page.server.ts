import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
    const response = await fetch('/api/v1/games?with_r2_key=true');

    if (!response.ok) {
        throw new Error(`Failed to fetch games: ${response.status}`);
    }

    const games = await response.json();

    return {
        games
    };
};