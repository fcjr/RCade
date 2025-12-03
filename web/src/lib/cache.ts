const GAMES_CACHE_KEY_CABINET = 'https://rcade.dev/api/v1/games?auth=cabinet';
const GAMES_CACHE_KEY_PUBLIC = 'https://rcade.dev/api/v1/games?auth=public';

type CacheStorage = { default: Cache };

export async function invalidateGamesCache(caches: CacheStorage | undefined): Promise<void> {
    if (!caches) return;
    await Promise.all([
        caches.default.delete(GAMES_CACHE_KEY_CABINET),
        caches.default.delete(GAMES_CACHE_KEY_PUBLIC),
    ]);
}

export function getGamesCacheKey(authType: 'cabinet' | 'public'): string {
    return authType === 'cabinet' ? GAMES_CACHE_KEY_CABINET : GAMES_CACHE_KEY_PUBLIC;
}
