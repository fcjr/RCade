<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GameInfo } from '../../shared/types';
  import { navigateToGame, getLastPlayedGame } from '../router.svelte';
  import { Fireworks, type FireworksOptions } from '@fireworks-js/svelte'

  let games = $state<GameInfo[]>([]);
  let currentIndex = $state(0);
  let unsubscribeMenuKey: (() => void) | undefined;
  let lastFetchTime = 0;

  let p2UpPressed = $state<boolean>(false);
  let p2DownPressed = $state<boolean>(false);
  let p2LeftPressed = $state<boolean>(false);
  let p2RightPressed = $state<boolean>(false);
  let p2aPressed = $state<boolean>(false);
  let p2bPressed = $state<boolean>(false);
  let showFireworks = $derived(p2aPressed && p2bPressed);

  const currentGame = $derived(games.length > 0 ? games[currentIndex] : null);

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
    const hasGames = !(games.length === 0);

    const startKeys = ['f', 'g', '1', '2'];
    const key = event.key.toLowerCase();
    if (key === 'd' && hasGames) {
      currentIndex = (currentIndex + 1) % games.length;
    } else if (key === 'a' && hasGames) {
      currentIndex = (currentIndex - 1 + games.length) % games.length;
    } else if (startKeys.includes(key) && currentGame && hasGames) {
      navigateToGame(currentGame);
    } else if (key === 'i') {
      p2UpPressed = true;
    } else if (key === 'k') {
      p2DownPressed = true;
    } else if (key === 'j') {
      p2LeftPressed = true;
    } else if (key === 'l') {
      p2RightPressed = true;
    } else if (key === ';') {
      p2aPressed = true;
    } else if (key === '\'') {
      p2bPressed = true;
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    console.log('keyup:', event.key, event.code);
    const key = event.key.toLowerCase();

    if (key === 'i') {
      p2UpPressed = false;
    } else if (key === 'k') {
      p2DownPressed = false;
    } else if (key === 'j') {
      p2LeftPressed = false;
    } else if (key === 'l') {
      p2RightPressed = false;
    } else if (key === ';') {
      p2aPressed = false;
    } else if (key === '\'') {
      p2bPressed = false;
    }
  }

  function projectToColor(project: string) {
    let hash = 0;
    const len = project.length;

    for (let i = 0; i < len; i++) {
        const char = project.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    const angle = Math.abs(hash) % 361;
    return `hsl(${angle}, 50%, 25%)`
  }

  onMount(() => {
    fetchGames();
    if (window.rcade) {
      unsubscribeMenuKey = window.rcade.onMenuKey(fetchGames);
    }
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyUp);
  });

  onDestroy(() => {
    unsubscribeMenuKey?.();
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('keyup', handleKeyUp);
  });

  const fireworkOptions: FireworksOptions = {
    sound: {
      enabled: true,
      files: [
        'explosion0.mp3',
        'explosion1.mp3',
        'explosion2.mp3'
      ],
    }
  }
</script>

<div class="carousel" class:up={p2UpPressed} class:down={p2DownPressed} class:left={p2LeftPressed} class:right={p2RightPressed}>
  {#if showFireworks}
    <Fireworks options={fireworkOptions} />
  {/if}
  {#if currentGame}
    <div class="game-card">
      <h1 class="game-name">{currentGame.displayName ?? currentGame.name}</h1>
      <p class="game-version">v{currentGame.latestVersion}</p>
      {#if currentGame.authors.length > 0}
        <p class="game-authors">by {currentGame.authors.map(a => a.display_name).join(', ')}</p>
      {/if}
    </div>
    <div class="pagination">
      {#each games as game, i}
        <span class="dot" class:active={i === currentIndex} style="background-color: {projectToColor(game.id!)};"></span>
      {/each}
    </div>
  {:else}
    <div class="loading">Loading games...</div>
  {/if}
</div>

<style>
  .up {
    transform: perspective(400px) rotateX(15deg);
  }
  .up.left {
    transform: perspective(400px) rotateX(15deg) rotateY(-15deg);
  }
  .up.right {
    transform: perspective(400px) rotateX(15deg) rotateY(15deg);
  }
  .down {
    transform: perspective(400px) rotateX(-15deg);
  }
  .down.left {
     transform: perspective(400px) rotateX(-15deg) rotateY(-15deg);
  }
  .down.right {
     transform: perspective(400px) rotateX(-15deg) rotateY(15deg);
  }
  .left {
    transform: perspective(400px) rotateY(-15deg);
  }
  .right {
    transform: perspective(400px) rotateY(15deg);
  }

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
  }

  .game-name {
    font-size: clamp(24px, 12vw, 48px);
    font-weight: 700;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 2px;
    word-break: break-word;
    line-height: 1.1;
    margin-bottom: 8px;
  }

  .game-version {
    font-size: clamp(12px, 5vw, 18px);
    color: #888;
    font-weight: 400;
  }

  .game-authors {
    font-size: clamp(12px, 4vw, 16px);
    color: #666;
    font-weight: 400;
    margin-top: 4px;
  }

  .pagination {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #333;
    transition: background 0.2s;
  }

  .dot.active {
    border: 2px solid white;
  }

  .loading {
    font-size: clamp(16px, 6vw, 24px);
    color: #666;
  }
</style>
