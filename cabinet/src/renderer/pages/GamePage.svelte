<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { GameInfo } from "../../shared/types";
  import { navigateToCarousel } from "../router.svelte";

  interface Props {
    game: GameInfo;
  }

  let { game }: Props = $props();

  const PORTS_TAKEN = Symbol();

  let gameUrl = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function loadGame() {
    try {
      if (window.rcade) {
        // TODO: This can cause a leak with HMR. Shouldn't happen in prod - but we don't unload the game on unmount.
        const { url } = await window.rcade.loadGame($state.snapshot(game));

        gameUrl = url;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load game";
    } finally {
      loading = false;
    }
  }

  async function handleMenuKey() {
    if (window.rcade) {
      await window.rcade.unloadGame(game.id, game.name, game.latestVersion);
    }
    navigateToCarousel();
  }

  let unsubscribeMenuKey: (() => void) | undefined;

  onMount(() => {
    if (window.rcade) {
      unsubscribeMenuKey = window.rcade.onMenuKey(handleMenuKey);
    }

    loadGame();
  });

  onDestroy(() => {
    unsubscribeMenuKey?.();
  });

  let frame: HTMLIFrameElement | undefined = $state(undefined);

  setInterval(() => {
    frame?.focus();
  }, 100);

  onMount(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Security check: verify the message is from the iframe
      if (event.source !== frame?.contentWindow) {
        return;
      }

      if (event.data === "acquire_plugin_channel") {
        try {
          console.log("Acquiring");
          const { port, name, version } = await window.rcade.acquirePlugin(
            event.data.channel.name,
            event.data.channel.version,
          );

          frame.contentWindow?.postMessage({
            type: "plugin_channel",
            nonce: event.data.nonce,
            channel: { port, name, version },
          });
        } catch (err) {
          frame.contentWindow?.postMessage({
            type: "plugin_channel",
            nonce: event.data.nonce,
            error: { message: String(err) },
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);

    // Cleanup function - removes the listener when component unmounts
    return () => {
      window.removeEventListener("message", handleMessage);
    };
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
    {#if !window.rcade.getArgs().noExit}
      <p class="hint">Press Menu to return</p>
    {/if}
  </div>
{:else if gameUrl}
  <iframe
    bind:this={frame}
    class="game-frame"
    src={gameUrl}
    title={game.name}
    allow="accelerometer; gyroscope; camera; microphone; autoplay"
  ></iframe>
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
