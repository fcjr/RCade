<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { PageData } from './$types';
	import { getCoverArt } from '$lib/utils';
	import DeckUnit from '$lib/component/DeckUnit.svelte';
	import InputClassicPlugin, {
		InputClassicEmulator
	} from '$lib/component/plugins/@rcade/input-classic/plugin.svelte';
	import { RCadeWebEngine } from '@rcade/engine';

	let { data }: { data: PageData } = $props();

	// Helper to get initials for users without images
	function getInitials(name: string) {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.substring(0, 2)
			.toUpperCase();
	}

	let gameContents: HTMLDivElement;
	let gameContainer: HTMLDivElement;
	let plugin: InputClassicEmulator = $state(new InputClassicEmulator());

	let current_state:
		| { kind: 'idle' }
		| { kind: 'initializing' }
		| { kind: 'downloading'; state: string; progress: number; size: number }
		| { kind: 'playing' }
		| { kind: 'error'; error: string } = $state({ kind: 'idle' });

	// Function to scale game-contents to fit game container
	function scaleGameContents() {
		if (!gameContents || !gameContainer) return;

		const containerWidth = gameContainer.offsetWidth;
		const containerHeight = gameContainer.offsetHeight;
		const contentWidth = gameContents.offsetWidth;
		const contentHeight = gameContents.offsetHeight;

		if (contentWidth === 0 || contentHeight === 0) return;

		// Calculate scale to fill container (use minimum to fit entirely)
		const scaleX = containerWidth / contentWidth;
		const scaleY = containerHeight / contentHeight;
		const scale = Math.min(scaleX, scaleY);

		gameContents.style.transform = `scale(${scale})`;
	}

	// Set up ResizeObserver to handle dynamic resizing
	$effect(() => {
		if (!gameContainer) return;

		const resizeObserver = new ResizeObserver(() => {
			scaleGameContents();
		});

		resizeObserver.observe(gameContainer);

		// Also observe game-contents in case it changes size
		if (gameContents) {
			resizeObserver.observe(gameContents);
		}

		return () => {
			resizeObserver.disconnect();
		};
	});

	async function play() {
		current_state = { kind: 'initializing' };

		const engine = await RCadeWebEngine.initialize(gameContents);

		engine.register(plugin);

		await engine.load(data.game.id(), data.version.version());

		// Scale after content is loaded
		setTimeout(scaleGameContents, 100);
	}
</script>

<div class="game-detail-page">
	<nav class="nav-bar" in:fly={{ y: -20, duration: 500 }}>
		<a href="/games" class="back-link">&lt; // GAMES</a>
		<span class="path-separator">/</span>
		<span class="current-path">{data.game.name().toUpperCase()}</span>
		{#if data.version.version() !== data.game.latest().version()}
			<span class="path-separator">/</span>
			<span class="current-path">v{data.version.version()}</span>
		{/if}
	</nav>

	<main class="console-grid">
		<section class="stage-column" in:fly={{ x: -20, duration: 600, delay: 100 }}>
			<DeckUnit serialNo="DISPLAY_UNIT_PRIMARY" class="full-size">
				<div class="bezel-housing">
					<div class="monitor-frame large">
						<div class="game" bind:this={gameContainer}>
							{#if current_state.kind === 'idle'}
								<div class="crt-surface" style={getCoverArt(data.version)}>
									<div class="screen-glare"></div>
									<div class="overlay-ui">
										<div class="click-to-start">
											<button class="play-trigger" onclick={play}>PLAY</button>
										</div>
									</div>
								</div>
							{/if}
							<div class="game-overlay"></div>
							<div class="game-contents" bind:this={gameContents}></div>
						</div>

						<div class="bezel-label">RES: 336x262</div>
					</div>
				</div>
			</DeckUnit>

			<InputClassicPlugin bind:provider={plugin} />
		</section>

		<section class="info-column" in:fly={{ x: 20, duration: 600, delay: 200 }}>
			<div class="header-panel">
				<h1 class="game-title">{data.version.displayName()}</h1>
				<div class="meta-row">
					<span class="updated-tag">ID: {data.game.id()}</span>
				</div>
			</div>

			<DeckUnit serialNo="AUTHORS" class="info-unit">
				<div class="panel-body table-body">
					{#each data.version.authors() as author}
						{#if author.recurse_id}
							<a
								href="https://www.recurse.com/directory/{author.recurse_id}"
								target="_blank"
								rel="noopener noreferrer"
								class="author-row author-row-link"
							>
								<div class="author-avatar">
									{#if false}
										<!-- <img src={author.image} alt={author.name} /> -->
									{:else}
										<div class="avatar-placeholder">{getInitials(author.display_name)}</div>
									{/if}
								</div>
								<div class="author-details">
									<span class="author-name">{author.display_name}</span>
									<!-- {#if author.role}
                                        <span class="author-role">[{author.role}]</span>
                                    {/if} -->
								</div>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="recurse-icon"
								>
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
									<polyline points="15 3 21 3 21 9"></polyline>
									<line x1="10" y1="14" x2="21" y2="3"></line>
								</svg>
							</a>
						{:else}
							<div class="author-row">
								<div class="author-avatar">
									{#if false}
										<!-- <img src={author.image} alt={author.name} /> -->
									{:else}
										<div class="avatar-placeholder">{getInitials(author.display_name)}</div>
									{/if}
								</div>
								<div class="author-details">
									<span class="author-name">{author.display_name}</span>
									<!-- {#if author.role}
                                        <span class="author-role">[{author.role}]</span>
                                    {/if} -->
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</DeckUnit>

			<DeckUnit serialNo="DESCRIPTION" class="info-unit">
				<div class="panel-body">
					<p class="desc-text">{data.version.description()}</p>
				</div>
			</DeckUnit>

			<DeckUnit serialNo="VERSIONS" class="info-unit">
				<div class="panel-body list-body">
					{#each data.game.versions().reverse() as ver}
						<a
							href="/games/{data.game.name()}/{ver.version()}"
							class="version-row"
							class:active={ver.version() === data.version.version()}
						>
							<div class="ver-info">
								<span class="ver-id">v{ver.version()}</span>
							</div>
							<div class="ver-meta">
								<span class="ver-date">TODO</span>
							</div>
						</a>
					{/each}
				</div>
			</DeckUnit>

			<div class="tags-panel">
				{#each data.version.dependencies() as dep}
					<span class="tech-pill">{dep.name}@{dep.version}</span>
				{/each}
				{#if data.version.visibility() === 'public'}
					<span class="tech-pill vis-public">PUBLIC</span>
				{/if}
				{#if data.version.visibility() === 'internal'}
					<span class="tech-pill vis-unlisted">INTERNAL</span>
				{/if}
				{#if data.version.visibility() === 'private'}
					<span class="tech-pill vis-private">PRIVATE</span>
				{/if}
			</div>
		</section>
	</main>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Orbitron:wght@500;700&family=Roboto+Mono:wght@400;500&display=swap');

	:root {
		--deck-bg: #1e2124;
		--deck-face: #282b30;
		--deck-accent: #e67e22;
		--deck-success: #2ecc71;
		--deck-danger: #e74c3c;
		--deck-text: #aeb0b3;
	}

	.game-detail-page {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
		min-height: 100vh;
		color: var(--deck-text);
		font-family: 'Chakra Petch', sans-serif;
	}

	/* --- Navigation --- */
	.nav-bar {
		margin-bottom: 2rem;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.9rem;
		color: #666;
	}
	.back-link {
		color: var(--deck-accent);
		text-decoration: none;
		font-weight: 700;
	}
	.back-link:hover {
		text-decoration: underline;
	}
	.path-separator {
		margin: 0 0.5rem;
		color: #444;
	}

	/* --- Grid Layout --- */
	.console-grid {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 2rem;
		margin-bottom: 2rem;
	}

	/* --- Left Column: The Stage --- */
	.deck-unit.full-size {
		height: auto;
		border-radius: 4px;
		box-shadow: 0 15px 30px rgba(0, 0, 0, 0.6);
		background-color: var(--deck-bg);
		display: flex;
		flex-direction: column;
	}

	/* --- Controls & Monitor --- */
	.deck-controls-strip {
		padding: 10px 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--deck-face);
	}
	.primary-controls,
	.secondary-controls {
		display: flex;
		gap: 0.5rem;
	}
	.bezel-housing {
		padding: 1rem;
		background: var(--deck-bg);
		border-top: 1px solid #000;
	}
	.monitor-frame.large {
		background: #111;
		padding: 12px;
		border-radius: 4px;
		position: relative;
		box-shadow: inset 0 0 15px #000;
		border: 1px solid #333;
		display: flex;
		flex-direction: column;
	}
	.game {
		aspect-ratio: 336 / 262;
		display: grid;
		place-items: center;
		overflow: hidden;
	}
	.game > * {
		grid-area: 1 / 1;
	}
	.crt-surface {
		width: 100%;
		height: 100%;
		position: relative;
		border-radius: 2px;
		overflow: hidden;
		image-rendering: pixelated;
	}
	.game-contents {
		transform-origin: center center;
		transition: transform 0.2s ease-out;
	}
	.bezel-label {
		font-size: 0.55rem;
		color: #444;
		letter-spacing: 1px;
		font-family: 'Orbitron', sans-serif;
		text-align: center;
		margin-top: 12px;
	}
	.ctrl-btn {
		border: none;
		font-family: 'Chakra Petch', sans-serif;
		font-weight: 700;
		padding: 4px 12px;
		cursor: pointer;
		border-radius: 2px;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		transition: all 0.2s;
	}
	.ctrl-btn.execute {
		background: rgba(46, 204, 113, 0.1);
		border: 1px solid var(--deck-success);
		color: var(--deck-success);
	}
	.ctrl-btn.execute:hover {
		background: var(--deck-success);
		color: #000;
		box-shadow: 0 0 10px var(--deck-success);
	}
	.ctrl-btn.halt {
		background: rgba(231, 76, 60, 0.1);
		border: 1px solid var(--deck-danger);
		color: var(--deck-danger);
	}
	.ctrl-btn.halt:hover {
		background: var(--deck-danger);
		color: #fff;
		box-shadow: 0 0 10px var(--deck-danger);
	}
	.ctrl-btn.icon-only {
		background: transparent;
		color: #666;
		padding: 4px;
		font-size: 1rem;
	}
	.ctrl-btn.icon-only:hover {
		color: #fff;
	}
	.overlay-ui {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(2px);
	}
	.play-trigger {
		background: var(--deck-accent);
		border: 2px solid #fff;
		color: #000;
		font-family: 'Orbitron', sans-serif;
		font-weight: 900;
		font-size: 1.2rem;
		padding: 1rem 2rem;
		cursor: pointer;
		transition:
			transform 0.1s,
			box-shadow 0.1s;
	}
	.play-trigger:hover {
		transform: scale(1.05);
		box-shadow: 0 0 20px var(--deck-accent);
	}
	.click-to-start {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	.blink {
		animation: blinker 1.5s linear infinite;
		color: #fff;
		font-size: 0.8rem;
		letter-spacing: 2px;
	}
	@keyframes blinker {
		50% {
			opacity: 0;
		}
	}

	/* --- Info Column --- */
	.info-column,
	.stage-column {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.header-panel {
		border-left: 4px solid var(--deck-accent);
		padding-left: 1rem;
	}
	.game-title {
		font-family: 'Syne', sans-serif;
		font-size: 2.5rem;
		margin: 0 0 0.5rem 0;
		color: #fff;
		line-height: 1;
		text-transform: uppercase;
	}
	.meta-row {
		display: flex;
		gap: 1rem;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.75rem;
		color: #666;
		align-items: center;
	}
	.updated-tag {
		color: #666;
	}

	.info-unit .panel-body {
		background: var(--deck-face);
		border-left: 2px solid rgba(255, 255, 255, 0.05);
	}

	.info-unit .panel-body:not(.list-body):not(.table-body) {
		padding: 1rem;
	}

	.list-body {
		padding: 0;
		background: var(--deck-face);
		display: flex;
		flex-direction: column;
	}
	.version-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.2);
		text-decoration: none;
		color: var(--deck-text);
		transition: background 0.2s;
		border-left: 2px solid transparent;
	}
	.version-row:last-child {
		border-bottom: none;
	}
	.version-row:hover {
		background: rgba(255, 255, 255, 0.02);
		color: #fff;
	}
	.version-row.active {
		background: rgba(46, 204, 113, 0.05);
		border-left: 2px solid var(--deck-success);
	}
	.ver-info {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ver-id {
		font-family: 'Roboto Mono', monospace;
		font-weight: 700;
		color: #fff;
	}
	.version-row.active .ver-id {
		color: var(--deck-success);
	}
	.ver-label {
		font-size: 0.7rem;
		padding: 2px 6px;
		background: #111;
		border-radius: 4px;
		color: #666;
	}
	.ver-meta {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ver-date {
		font-size: 0.75rem;
		color: #555;
	}
	.ver-indicator {
		font-size: 0.6rem;
		color: var(--deck-success);
		font-weight: 700;
		letter-spacing: 1px;
	}
	.table-body {
		padding: 0 !important;
		display: flex;
		flex-direction: column;
	}
	.author-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.2);
		border-left: 2px solid transparent;
	}
	.author-row:last-child {
		border-bottom: none;
	}
	.author-avatar img,
	.avatar-placeholder {
		width: 36px;
		height: 36px;
		border-radius: 2px;
		border: 1px solid #444;
		object-fit: cover;
	}
	.avatar-placeholder {
		background: #333;
		color: #777;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 700;
	}
	.author-details {
		display: flex;
		flex-direction: column;
	}
	.author-name {
		color: #fff;
		font-weight: 600;
		font-size: 0.9rem;
	}
	.author-role {
		font-family: 'Roboto Mono', monospace;
		font-size: 0.7rem;
		color: var(--deck-accent);
	}
	.author-row-link {
		text-decoration: none;
		color: var(--deck-text);
		transition: background 0.2s;
		border-left: 2px solid transparent;
	}
	.author-row-link:hover {
		background: rgba(255, 255, 255, 0.02);
		color: #fff;
	}
	.recurse-icon {
		margin-left: auto;
		color: #666;
		transition: color 0.2s;
		flex-shrink: 0;
	}
	.author-row-link:hover .recurse-icon {
		color: var(--deck-accent);
	}
	.desc-text {
		font-size: 0.9rem;
		line-height: 1.5;
		color: #aeb0b3;
		padding: 1rem;
	}
	.tags-panel {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.tech-pill {
		background: #111;
		border: 1px solid #333;
		color: #666;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.7rem;
		padding: 4px 8px;
		border-radius: 100px;
	}
	.tech-pill.vis-public {
		border-color: var(--deck-success);
		color: var(--deck-success);
	}
	.tech-pill.vis-unlisted {
		border-color: #f39c12;
		color: #f39c12;
	}
	.tech-pill.vis-private {
		border-color: var(--deck-danger);
		color: var(--deck-danger);
	}

	.screen-glare {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 40%;
		background: linear-gradient(to bottom, rgba(255, 255, 255, 0.05), transparent);
		z-index: 10;
		pointer-events: none;
	}

	@media (max-width: 768px) {
		.console-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
