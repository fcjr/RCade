<script lang="ts">
  import { getRoute } from "./router.svelte";
  import CarouselPage from "./pages/CarouselPage.svelte";
  import GamePage from "./pages/GamePage.svelte";

  const route = $derived(getRoute());
</script>

{#if route.page === "carousel"}
  <CarouselPage />
{:else if route.page === "game"}
  <GamePage game={route.game} />
{/if}

<style>
  @font-face {
    font-family: 'NotoColorEmoji';
    src: url('/fonts/NotoColorEmoji.ttf') format('truetype');
    font-display: swap;
  }

  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    user-select: none;
  }

  :global(html, body) {
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  :global(body) {
    background: #0a0a14;
    color: #fff;
    font-family:
      system-ui,
      -apple-system,
      sans-serif,
      'NotoColorEmoji';
  }

  :global(*) {
    cursor:
      url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
      none !important;
  }
</style>
