import { Game } from '@rcade/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data }) => {
    return {
        games: data.games.map((game: any) => Game.fromApiResponse(game)) as Game[]
    };
};