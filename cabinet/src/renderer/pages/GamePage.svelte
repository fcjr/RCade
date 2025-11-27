<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GameInfo } from '../../shared/types';
  import { navigateToCarousel } from '../router.svelte';

  interface Props {
    game: GameInfo;
  }

  let { game }: Props = $props();

  let gameUrl = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function loadGame() {
    try {
      if (window.rcade) {
        // Clone to plain object for IPC serialization
        const gameData = {
          id: game.id,
          name: game.name,
          latestVersion: game.latestVersion,
        };
        const result = await window.rcade.loadGame(gameData);
        gameUrl = result.url;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load game';
    } finally {
      loading = false;
    }
  }

  async function handleKeydown(event: KeyboardEvent) {
    if (event.code === 'ShiftLeft') {
      if (window.rcade) {
        await window.rcade.unloadGame(game.id, game.latestVersion);
      }
      navigateToCarousel();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    loadGame();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if loading}
  <div class="game-page">
    <div class="game-card">
      <h1 class="game-name">{game.name}</h1>
      <p class="status">Loading...</p>
    </div>
  </div>
{:else if error}
  <div class="game-page">
    <div class="game-card">
      <h1 class="game-name">{game.name}</h1>
      <p class="error">{error}</p>
    </div>
    <p class="hint">Press Menu to return</p>
  </div>
{:else if gameUrl}
  <iframe class="game-frame" src={gameUrl} title={game.name}></iframe>
{/if}

<style>
  .game-page {
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

  .status {
    font-size: clamp(12px, 5vw, 18px);
    color: #888;
    font-weight: 400;
  }

  .error {
    font-size: clamp(12px, 5vw, 18px);
    color: #f55;
    font-weight: 400;
  }

  .hint {
    font-size: clamp(10px, 4vw, 14px);
    color: #555;
    position: absolute;
    bottom: 16px;
  }

  .game-frame {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
  }
</style>
