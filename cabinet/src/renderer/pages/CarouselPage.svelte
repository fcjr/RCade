<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GameInfo } from '../../shared/types';
  import { navigateToGame, getLastPlayedGame } from '../router.svelte';

  let games = $state<GameInfo[]>([]);
  let currentIndex = $state(0);
  let unsubscribeMenuKey: (() => void) | undefined;
  let lastFetchTime = 0;

  // Generate a consistent color from a string (algo from cysabi's PR #29, lightened for strokes)
  function projectToColor(project: string) {
    let hash = 0;
    const len = project.length;
    for (let i = 0; i < len; i++) {
      const char = project.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const angle = Math.abs(hash) % 361;
    return `hsl(${angle}, 70%, 65%)`;
  }

  const currentGame = $derived(games.length > 0 ? games[currentIndex] : null);
  const gameName = $derived(currentGame?.displayName ?? currentGame?.name ?? '');
  const gameColor = $derived(projectToColor(currentGame?.id ?? gameName));
  const nameLength = $derived(gameName.length);
  // Scale font size based on name length
  const nameFontSize = $derived(
    nameLength <= 8 ? 'clamp(20px, 12vw, 40px)' :
    nameLength <= 12 ? 'clamp(16px, 10vw, 32px)' :
    nameLength <= 20 ? 'clamp(14px, 8vw, 24px)' :
    'clamp(12px, 6vw, 18px)'
  );

  function gamesMatch(a: GameInfo, b: GameInfo): boolean {
    return (a.id != null && a.id === b.id) ||
      (a.id == null && a.name === b.name && a.latestVersion === b.latestVersion);
  }

  function findGameIndex(gameList: GameInfo[], game: GameInfo): number {
    return gameList.findIndex(g => gamesMatch(g, game));
  }

  async function fetchGames() {
    const now = Date.now();
    if (now - lastFetchTime < 1000) return;
    lastFetchTime = now;

    try {
      if (window.rcade) {
        const prevGame = currentGame;
        const newGames = await window.rcade.getGames();

        if (newGames.length > 0) {
          // Determine which game to select
          const targetGame = prevGame ?? getLastPlayedGame();
          if (targetGame) {
            const idx = findGameIndex(newGames, targetGame);
            if (idx !== -1) {
              currentIndex = idx;
            } else if (currentIndex >= newGames.length) {
              currentIndex = newGames.length - 1;
            }
          }
        } else {
          currentIndex = 0;
        }

        games = newGames;
      }
    } catch (e) {
      console.error('Failed to fetch games:', e);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    console.log('keydown:', event.key, event.code);
    if (games.length === 0) return;

    const startKeys = ['f', 'g', ';', '\'', '1', '2'];
    const key = event.key.toLowerCase();
    if (key === 'd' || key === "l") {
      currentIndex = (currentIndex + 1) % games.length;
    } else if (key === 'a' || key === "j") {
      currentIndex = (currentIndex - 1 + games.length) % games.length;
    } else if (startKeys.includes(key) && currentGame) {
      navigateToGame(currentGame);
    }
  }

  onMount(() => {
    fetchGames();
    if (window.rcade) {
      unsubscribeMenuKey = window.rcade.onMenuKey(fetchGames);
    }
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    unsubscribeMenuKey?.();
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="carousel">
  {#if currentGame}
    <div class="game-card">
      {#if currentGame.svgPreview}
        <div class="preview">
          <svg viewBox="0 0 100 100" class="preview-svg">
            <path d={currentGame.svgPreview} stroke={gameColor} fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      {/if}
      <h1 class="game-name" style="font-size: {nameFontSize}">{gameName}</h1>
      {#if currentGame.authors.length > 0}
        <p class="game-authors">by {currentGame.authors.map(a => a.display_name).join(', ')}</p>
      {/if}
      <p class="game-version">v{currentGame.latestVersion}</p>
    </div>
    <nav class="nav-bar">
      <span class="nav-prev">{games.length > 1 ? `← ${games[(currentIndex - 1 + games.length) % games.length].displayName ?? games[(currentIndex - 1 + games.length) % games.length].name}` : ''}</span>
      <span class="nav-current">{currentIndex + 1}/{games.length}</span>
      <span class="nav-next">{games.length > 1 ? `${games[(currentIndex + 1) % games.length].displayName ?? games[(currentIndex + 1) % games.length].name} →` : ''}</span>
    </nav>
  {:else}
    <div class="loading">Loading games...</div>
  {/if}
</div>

<style>
  .carousel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 8px;
    text-align: center;
  }

  .game-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    gap: 4px;
  }

  .preview {
    width: clamp(60px, 25vw, 100px);
    height: clamp(60px, 25vw, 100px);
    margin-bottom: 8px;
  }

  .preview-svg {
    width: 100%;
    height: 100%;
    color: #fff;
  }

  .game-name {
    font-weight: 700;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 1px;
    word-break: break-word;
    line-height: 1.1;
    max-width: 100%;
  }

  .game-authors {
    font-size: clamp(10px, 3.5vw, 14px);
    color: #888;
    font-weight: 400;
  }

  .game-version {
    font-size: clamp(7px, 2vw, 9px);
    color: #444;
    font-weight: 400;
    margin-top: 4px;
  }

  .nav-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 8px 4px;
    font-size: clamp(7px, 2vw, 9px);
    color: #444;
  }

  .nav-prev, .nav-next {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 35%;
  }

  .nav-prev {
    text-align: left;
  }

  .nav-next {
    text-align: right;
  }

  .nav-current {
    flex-shrink: 0;
    padding: 0 4px;
    color: #555;
    font-variant-numeric: tabular-nums;
  }

  .loading {
    font-size: clamp(14px, 5vw, 20px);
    color: #666;
  }
</style>
