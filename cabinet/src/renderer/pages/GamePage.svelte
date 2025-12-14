<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { GameInfo } from "../../shared/types";
  import { navigateToMenu } from "../router.svelte";
  import { QuitOptionsSchema, type QuitOptions } from "@rcade/sdk";
  import z from "zod";
  interface Props {
    game: GameInfo;
  }

  let { game }: Props = $props();

  const PORTS_TAKEN = Symbol();
  const isDev = window.rcade.getArgs().isDev;

  let gameUrl = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function loadGame() {
    try {
      if (window.rcade) {
        const { url } = await window.rcade.loadGame($state.snapshot(game));

        gameUrl = url;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load game";
    } finally {
      loading = false;
    }
  }

  async function closeGame(quitOptions: QuitOptions | undefined) {
    if (QuitOptionsSchema.safeParse(quitOptions).error)
      quitOptions = {
        type: "error",
        reason: "Game provided an invalid quit reason object",
      };

    if (window.rcade) {
      await window.rcade.unloadGame(
        game.id,
        game.name,
        game.latestVersion,
        quitOptions!,
      );
    }
    navigateToMenu();
  }

  let unsubscribeMenuKey: (() => void) | undefined;

  onMount(() => {
    if (window.rcade && game.name !== "menu") {
      unsubscribeMenuKey = window.rcade.onMenuKey(() =>
        closeGame({ type: "return-to-menu" }),
      );
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

  const receivedPorts = new Map<string, MessagePort>();

  onMount(() => {
    const instance = crypto.randomUUID();
    const handleMessage = async (event: MessageEvent) => {
      // Handle ports transferred from preload script
      if (
        event.data?.type === "plugin-port-transfer" &&
        event.data.gameInstance == instance
      ) {
        const { nonce } = event.data;
        const port = event.ports[0];
        if (port) {
          receivedPorts.set(nonce, port);
        }
        return;
      }

      // Security check: verify the message is from the iframe
      if (event.source !== frame?.contentWindow) {
        return;
      }

      if (event.data.type === "quit") {
        closeGame(event.data.options as QuitOptions | undefined);
        return;
      }

      if (event.data.type === "acquire_plugin_channel") {
        try {
          const { nonce, name, version } = await window.rcade.acquirePlugin(
            event.data.channel.name,
            event.data.channel.version,
            instance,
          );

          // Wait for the port to arrive via postMessage
          // Poll for a short time in case there's a race condition
          let port: MessagePort | undefined;
          const maxAttempts = 50; // 500ms total
          for (let i = 0; i < maxAttempts; i++) {
            port = receivedPorts.get(nonce);
            if (port) {
              receivedPorts.delete(nonce);
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          if (port === undefined) {
            throw new Error("Port never received");
          }

          frame.contentWindow?.postMessage(
            {
              type: "plugin_channel",
              nonce: event.data.nonce,
              channel: { name, version },
            },
            "*",
            [port],
          );
        } catch (err) {
          console.log(err);

          frame.contentWindow?.postMessage(
            {
              type: "plugin_channel",
              nonce: event.data.nonce,
              error: { message: String(err) },
            },
            "*",
          );
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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="game-container"
    onkeydown={(e) => e.stopPropagation()}
    onkeyup={(e) => e.stopPropagation()}
    onmousedown={(e) => e.stopPropagation()}
    onmouseup={(e) => e.stopPropagation()}
    onmousemove={(e) => e.stopPropagation()}
    onclick={(e) => e.stopPropagation()}
  >
    <iframe
      bind:this={frame}
      class="game-frame"
      class:no-pointer={!isDev}
      src={gameUrl}
      title={game.name}
      sandbox="allow-scripts allow-same-origin"
      allow={game.permissions.includes("camera") ? "camera" : ""}
    ></iframe>
  </div>
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

  .game-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .game-frame {
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
  }

  .game-frame.no-pointer {
    pointer-events: none;
  }
</style>
