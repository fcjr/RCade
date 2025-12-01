<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { WebPluginManager } from "$lib/plugins/manager";

	let { data } = $props();

	const latestVersion = data.game.versions.sort((a, b) =>
		b.version.localeCompare(a.version, undefined, { numeric: true })
	)[0];

	let gameFrame: HTMLIFrameElement | undefined = $state();
	let pluginManager = new WebPluginManager();
	let loading = $state(true);
	let loadingStatus = $state("Initializing...");
	let error = $state<string | null>(null);
	let gameUrl = $state<string | null>(null);

	onMount(() => {
		const handleMessage = async (event: MessageEvent) => {
			if (event.source !== gameFrame?.contentWindow) return;
			if (event.data?.type !== "acquire_plugin_channel") return;

			try {
				const { port, version } = await pluginManager.acquirePlugin(
					event.data.channel.name,
					event.data.channel.version
				);
				gameFrame?.contentWindow?.postMessage(
					{ type: "plugin_channel", nonce: event.data.nonce, channel: { name: event.data.channel.name, version } },
					"*",
					[port]
				);
			} catch (err) {
				gameFrame?.contentWindow?.postMessage(
					{ type: "plugin_channel", nonce: event.data.nonce, error: { message: String(err) } },
					"*"
				);
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	});

	onMount(async () => {
		if (!latestVersion?.contents?.url) {
			error = "Game content not available";
			loading = false;
			return;
		}

		try {
			const { loadGame, registerGameServiceWorker, cacheGameFiles, getGameCacheUrl } =
				await import("$lib/game-loader");

			loadingStatus = "Registering service worker...";
			const swRegistration = await registerGameServiceWorker();

			loadingStatus = "Downloading game...";
			const gameFiles = await loadGame(latestVersion.contents.url);

			loadingStatus = "Caching game files...";
			await cacheGameFiles(data.game.name, gameFiles, swRegistration);

			gameUrl = getGameCacheUrl(data.game.name);
			loading = false;
		} catch (e) {
			console.error("Failed to load game:", e);
			error = e instanceof Error ? e.message : "Failed to load game";
			loading = false;
		}
	});

	onDestroy(() => pluginManager.destroy());
</script>

<svelte:head>
	<title>{latestVersion?.displayName ?? data.game.name} - RCade</title>
</svelte:head>

<p><a href="/">← Back to games</a></p>

<h1>{latestVersion?.displayName ?? data.game.name}</h1>
{#if latestVersion?.description}
	<p>{latestVersion.description}</p>
{/if}

{#if loading}
	<p>{loadingStatus}</p>
{:else if error}
	<p style="color: red;">Error: {error}</p>
{:else if gameUrl}
	<div class="game-container">
		<iframe
			bind:this={gameFrame}
			src={gameUrl}
			title={latestVersion?.displayName ?? data.game.name}
			sandbox="allow-scripts allow-same-origin"
		></iframe>
	</div>
{/if}

<h3>Keyboard Controls</h3>
<h4>Player 1</h4>
<ul>
	<li><strong>Move:</strong> WASD</li>
	<li><strong>Button A:</strong> F</li>
	<li><strong>Button B:</strong> G</li>
</ul>
<h4>Player 2</h4>
<ul>
	<li><strong>Move:</strong> IJKL</li>
	<li><strong>Button A:</strong> ;</li>
	<li><strong>Button B:</strong> '</li>
</ul>
<h4>System</h4>
<ul>
	<li><strong>1 Player Start:</strong> 1</li>
	<li><strong>2 Player Start:</strong> 2</li>
</ul>

<style>
	.game-container {
		width: 512px;
		height: 384px;
		border: 1px solid #ccc;
	}

	iframe {
		width: 512px;
		height: 384px;
		border: none;
		pointer-events: none;
	}
</style>
