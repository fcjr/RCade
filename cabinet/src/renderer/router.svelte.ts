import { type GameInfo } from '../shared/types';

type Route =
  | { page: 'carousel' }
  | { page: 'blank' }
  | { page: 'game'; game: GameInfo };

const { manifest: initialManifest } = window.rcade.getArgs();

let currentRoute = $state<Route>(initialManifest == null ? { page: 'blank' } : {
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

if (currentRoute.page === 'blank') {
  navigateToMenu();
}

let lastPlayedGame = $state<GameInfo | null>(null);

export function getRoute() {
  return currentRoute;
}

export function getLastPlayedGame() {
  return lastPlayedGame;
}

let MENU_GAME: GameInfo | undefined = undefined;

export async function navigateToMenu() {
  currentRoute = { page: 'blank' };

  try {
    const menuGame = await window.rcade.getMenuGame();
    MENU_GAME = menuGame;
  } catch (error) {
    if (MENU_GAME) {
      console.warn("Failed to fetch menu game, using cached version:", error);
    } else {
      console.error("Failed to fetch menu game and no cached version available:", error);
      currentRoute = { page: 'carousel' };
      return;
    }
  }

  currentRoute = { page: 'game', game: MENU_GAME };
}

export function navigateToGame(game: GameInfo) {
  lastPlayedGame = game;
  currentRoute = { page: 'game', game };
}
