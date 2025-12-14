import { tick } from 'svelte';
import { type GameInfo, Route } from '../shared/types.js';

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

window.rcade.onRoute((route: Route) => {
  console.log('Route change received:', route);

  if (route.page === 'game') {
    navigateToGame(route.game);
  } else if (route.page === 'blank') {
    navigateToMenu();
  }
});

let MENU_GAME: GameInfo | undefined = undefined;

export async function navigateToMenu() {
  currentRoute = { page: 'blank' };
}

export async function navigateToGame(game: GameInfo) {
  currentRoute = { page: 'blank' };

  await tick();

  lastPlayedGame = game;
  currentRoute = { page: 'game', game };
}
