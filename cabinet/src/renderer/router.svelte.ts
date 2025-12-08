import { type GameInfo } from '../shared/types';

type Route =
  | { page: 'carousel' }
  | { page: 'game'; game: GameInfo };

const { manifest: initialManifest } = window.rcade.getArgs();

let currentRoute = $state<Route>(initialManifest == null ? { page: 'carousel' } : {
  page: "game", game: {
    id: undefined,
    name: initialManifest.name,
    displayName: initialManifest.display_name ?? null,
    latestVersion: initialManifest.version ?? undefined,
    authors: Array.isArray(initialManifest.authors)
      ? initialManifest.authors.map(a => ({ display_name: a.display_name }))
      : [{ display_name: initialManifest.authors.display_name }],
    dependencies: initialManifest.dependencies ?? [],
    permissions: initialManifest.permissions ?? [],
  }
});

let lastPlayedGame = $state<GameInfo | null>(null);

export function getRoute() {
  return currentRoute;
}

export function getLastPlayedGame() {
  return lastPlayedGame;
}

export function navigateToCarousel() {
  currentRoute = { page: 'carousel' };
}

export function navigateToGame(game: GameInfo) {
  lastPlayedGame = game;
  currentRoute = { page: 'game', game };
}
