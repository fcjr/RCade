<script lang="ts">
  import { onMount } from 'svelte';

  let versions = $state({ electron: '', chrome: '', node: '' });

  onMount(async () => {
    if (window.rcade) {
      versions = await window.rcade.getVersions();
    }
  });
</script>

<div class="container">
  <h1>rcade client</h1>
  <p class="info">Electron {versions.electron} | Chrome {versions.chrome} | Node {versions.node}</p>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    background: #1a1a2e;
    color: #eee;
    min-height: 100vh;
  }
</style>
