import { Game } from '@rcade/api';
import type { PageLoad } from '../$types';

export const load: PageLoad = async ({ data }) => {
    const game = Game.fromApiResponse(data.game);
    const version = (data as any).version ? game.versions().find(v => v.version() === (data as any).version) : game.latest();

    if (!version) {
        throw new Error('Game version not found');
    }

    return {
        game,
        version
    };
};