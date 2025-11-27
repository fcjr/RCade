<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GameInfo } from '../../shared/types';
  import { navigateToGame } from '../router.svelte';

  let games = $state<GameInfo[]>([]);
  let currentIndex = $state(0);
  let fetchInterval: ReturnType<typeof setInterval> | null = null;

  const currentGame = $derived(games.length > 0 ? games[currentIndex] : null);

  async function fetchGames() {
    try {
      if (window.rcade) {
        games = await window.rcade.getGames();
      }
    } catch (e) {
      console.error('Failed to fetch games:', e);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (games.length === 0) return;

    if (event.key === 'ArrowRight') {
      currentIndex = (currentIndex + 1) % games.length;
    } else if (event.key === 'ArrowLeft') {
      currentIndex = (currentIndex - 1 + games.length) % games.length;
    } else if (event.code === 'ControlLeft' && currentGame) {
      navigateToGame(currentGame);
    }
  }

  onMount(() => {
    fetchGames();
    fetchInterval = setInterval(fetchGames, 5000);
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    if (fetchInterval) clearInterval(fetchInterval);
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="carousel">
  {#if currentGame}
    <div class="game-card">
      <h1 class="game-name">{currentGame.name}</h1>
      <p class="game-version">v{currentGame.latestVersion}</p>
    </div>
    <div class="pagination">
      {#each games as _, i}
        <span class="dot" class:active={i === currentIndex}></span>
      {/each}
    </div>
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

  .pagination {
    display: flex;
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
    background: #fff;
  }

  .loading {
    font-size: clamp(16px, 6vw, 24px);
    color: #666;
  }
</style>
