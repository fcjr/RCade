<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { PageData } from './$types';
	import { getCoverArt } from '$lib/utils';
	import DeckUnit from '$lib/component/DeckUnit.svelte';
	import InputClassicPlugin, {
		InputClassicEmulator
	} from '$lib/component/plugins/@rcade/input-classic/plugin.svelte';
	import { RCadeWebEngine, type ProgressReport } from '@rcade/engine';
	import type { Game, GameVersion } from '@rcade/api';
	import { Logger, BrowserLogRenderer } from '@rcade/log';
	import { onDestroy } from 'svelte';
	import { env } from "$env/dynamic/public";

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
		| { kind: 'loading'; progress: ProgressReport }
		| { kind: 'playing' }
		| { kind: 'permission_denied'; permission: string }
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

	$effect(() => {
		handleUpdate(data.game, data.version);
	});

	async function handleUpdate(game: Game, version: GameVersion) {
		if (ENGINE == undefined) return undefined;

		try {
			current_state = { kind: 'initializing' };

			await ENGINE.unload();

			await ENGINE.load(game, version.version(), (progress) => {
				if (current_state.kind !== 'loading' && current_state.kind !== 'initializing') return;

				current_state = { kind: 'loading', progress };
			});

			current_state = { kind: 'playing' };
		} catch (err) {
			handleError(err);
			return;
		}
	}

	let ENGINE: RCadeWebEngine | undefined = undefined;
	let ENGINE_DESTROY = new AbortController();

	onDestroy(() => {
		ENGINE_DESTROY.abort();
	});

	function handleError(content: any) {
		if (typeof content === 'string')
			return void (current_state = { kind: 'error', error: content });

		if (Error.isError(content))
			return void (current_state = { kind: 'error', error: (content as Error).message });

		return (current_state = { kind: 'error', error: String(content) });
	}

	async function play() {
		current_state = { kind: 'initializing' };

		try {
			ENGINE ??= await RCadeWebEngine.initialize(gameContents, {
				logger: Logger.create().withHandler(BrowserLogRenderer).withMinimumLevel('DEBUG'),
				cancellationToken: ENGINE_DESTROY.signal,
				appUrl: env.PUBLIC_USE_LOCAL_APP === "true" ? "http://localhost:5173" : undefined
			});

			ENGINE.onPermissionDenied((permission) => {
				current_state = { kind: 'permission_denied', permission };
			});

			ENGINE.register(plugin);

			await ENGINE.load(data.game, data.version.version(), (progress) => {
				if (current_state.kind !== 'loading' && current_state.kind !== 'initializing') return;

				current_state = { kind: 'loading', progress };
			});

			current_state = { kind: 'playing' };
		} catch (err) {
			handleError(err);
			return;
		}

		// Scale after content is loaded
		setTimeout(scaleGameContents, 100);
	}

	function formatRelativeDate(created: Date) {
		const now = new Date();
		const diffMs = +now - +created;
		const diffSecs = Math.floor(diffMs / 1000);
		const diffMins = Math.floor(diffSecs / 60);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);
		const diffWeeks = Math.floor(diffDays / 7);
		const diffMonths = Math.floor(diffDays / 30);
		const diffYears = Math.floor(diffDays / 365);

		if (diffYears > 0) return `${diffYears}Y`;
		if (diffMonths > 0) return `${diffMonths}M`;
		if (diffWeeks > 0) return `${diffWeeks}W`;
		if (diffDays > 0) return `${diffDays}D`;
		if (diffHours > 0) return `${diffHours}h`;
		if (diffMins > 0) return `${diffMins}m`;
		return 'now';
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
							<div
								class="game-overlay"
								class:active={current_state.kind !== 'idle' && current_state.kind !== 'playing'}
							>
								{#if current_state.kind === 'initializing'}
									<div class="status-indicator">
										<div class="spinner"></div>
										<div class="status-text">INITIALIZING RUNTIME...</div>
									</div>
								{:else if current_state.kind === 'loading'}
									{@const p = current_state.progress}
									<div class="loading-terminal">
										<div class="terminal-header">LOADING</div>

										<div class="status-text blink">
											{#if p.state === 'starting'}
												>> INITIALIZING ENVIRONMENT...
											{:else if p.state === 'fetching'}
												>> RETRIEVING PACKAGE MANIFEST...
											{:else if p.state === 'downloading'}
												>> STREAMING DATA BLOCKS...
											{:else if p.state === 'opening'}
												>> MOUNTING VFS...
											{:else if p.state === 'clearing_cache'}
												>> PURGING STALE DATA...
											{:else if p.state === 'unpacking'}
												>> DECOMPRESSING ASSETS...
											{:else if p.state === 'caching'}
												>> BUILDING CACHE...
											{:else if p.state === 'finishing'}
												>> FINALIZING LINK...
											{/if}
										</div>

										{#if p.state === 'downloading' || p.state === 'caching' || p.state === 'clearing_cache'}
											{@const percent =
												p.state === 'downloading' && p.total
													? p.progress
													: p.state === 'caching' || p.state === 'clearing_cache'
														? (p.current_index / p.total) * 100
														: 0}
											<div class="progress-track">
												<div class="progress-fill" style="width: {percent}%"></div>
											</div>
											<div class="progress-numbers">
												{#if p.state === 'downloading' && p.total}
													{(((p.progress / 100) * p.total) / 1024 / 1024).toFixed(1)}MB / {(
														p.total /
														1024 /
														1024
													).toFixed(1)}MB
												{:else if p.state === 'caching' || p.state === 'clearing_cache'}
													FILE {p.current_index} / {p.total}
												{/if}
											</div>
										{/if}
									</div>
								{:else if current_state.kind === 'permission_denied'}
									<div class="error-panel permission-panel">
										<div class="error-title">PERMISSION REQUIRED</div>
										<div class="error-code">ACCESS_DENIED</div>
										<p class="error-msg">
											This game requires {current_state.permission} access to run. Please allow {current_state.permission}
											access and try again.
										</p>
										<button class="retry-btn" onclick={() => (current_state = { kind: 'idle' })}>
											DISMISS
										</button>
									</div>
								{:else if current_state.kind === 'error'}
									<div class="error-panel">
										<div class="error-title">FATAL ERROR</div>
										<div class="error-code">RUNTIME_EXCEPTION</div>
										<p class="error-msg">{current_state.error}</p>
									</div>
								{/if}
							</div>
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

				<div class="control-strip">
					<div class="sys-chip">
						<span class="chip-label">ID</span>
						<span class="chip-value">{data.game.id()}</span>
					</div>

					<div class="sys-chip">
						<span class="chip-label icon-label">
							<span class="status-light {data.version.visibility()}"></span>
						</span>
						<div class="chip-value">
							{data.version.visibility()?.toUpperCase()}
						</div>
					</div>

					{#each data.version.dependencies() as dep}
						<div class="sys-chip">
							<span class="chip-label icon-label">
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path
										d="M19.428 15.561C17.81 15.561 16.5 16.871 16.5 18.489C16.5 20.107 17.81 21.417 19.428 21.417C21.046 21.417 22.356 20.107 22.356 18.489C22.356 16.871 21.046 15.561 19.428 15.561Z"
									/>
									<path
										d="M15.561 4.572C15.561 2.954 16.871 1.644 18.489 1.644C20.107 1.644 21.417 2.954 21.417 4.572C21.417 6.19 20.107 7.5 18.489 7.5C16.871 7.5 15.561 6.19 15.561 4.572Z"
									/>
									<path
										d="M4.572 15.561C2.954 15.561 1.644 16.871 1.644 18.489C1.644 20.107 2.954 21.417 4.572 21.417C6.19 21.417 7.5 20.107 7.5 18.489C7.5 16.871 6.19 15.561 4.572 15.561Z"
									/>
									<path
										d="M7.5 4.572C7.5 6.19 6.19 7.5 4.572 7.5C2.954 7.5 1.644 6.19 1.644 4.572C1.644 2.954 2.954 1.644 4.572 1.644C6.19 1.644 7.5 2.954 7.5 4.572Z"
									/>
									<path d="M7.5 16.839H16.5V18.489H7.5V16.839Z" />
									<path d="M7.5 4.572H16.5V6.222H7.5V4.572Z" />
									<path d="M16.839 7.5H18.489V16.5H16.839V7.5Z" />
									<path d="M4.572 7.5H6.222V16.5H4.572V7.5Z" />
								</svg>
							</span>
							<span class="chip-value">{dep.name} <span class="dim-ver">@{dep.version}</span></span>
						</div>
					{/each}

					<div class="repo-actions">
						{#if data.game.gitHttps()}
							<a
								href={data.game.gitHttps()}
								target="_blank"
								rel="noopener noreferrer"
								class="repo-btn source"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
									/>
								</svg>
								<span>SOURCE</span>
							</a>
						{/if}
						<a
							href={`https://github.com/rcade-community/${data.game.name()}`}
							target="_blank"
							rel="noopener noreferrer"
							class="repo-btn community"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
								<circle cx="9" cy="7" r="4"></circle>
								<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
								<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
							</svg>
							<span>COMMUNITY</span>
						</a>
					</div>
				</div>

				{#if data.version.categories && data.version.categories().length > 0}
					<div class="category-strip">
						{#each data.version.categories() as category}
							<a
								href="/games?c={encodeURIComponent(category.name)}"
								class="category-tag"
								title={category.description}
							>
								<span class="tag-hash">#</span>
								{category.name}
							</a>
						{/each}
					</div>
				{/if}
			</div>

			{#if data.game.lockReason() != undefined}
				<DeckUnit serialNo="ADMIN NOTE" class="info-unit">
					<div class="panel-body">
						{#if data.game.lockReason() == ''}
							<p class="desc-text">An admin locked this game from public access.</p>
						{:else}
							<p class="desc-text">{data.game.lockReason()}</p>
						{/if}
					</div>
				</DeckUnit>
			{/if}

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
									{#if false}{:else}
										<div class="avatar-placeholder">{getInitials(author.display_name)}</div>
									{/if}
								</div>
								<div class="author-details">
									<span class="author-name">{author.display_name}</span>
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
									{#if false}{:else}
										<div class="avatar-placeholder">{getInitials(author.display_name)}</div>
									{/if}
								</div>
								<div class="author-details">
									<span class="author-name">{author.display_name}</span>
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
							href={ver.version() === data.game.latest().version()
								? '/games/' + data.game.name()
								: '/games/' + data.game.name() + '/' + ver.version()}
							class="version-row"
							class:active={ver.version() === data.version.version()}
						>
							<div class="ver-info">
								<span class="ver-id">v{ver.version()}</span>
							</div>
							{#if ver.createdAt() != undefined}
								<div class="ver-meta">
									<span class="ver-date">{formatRelativeDate(ver.createdAt()!)}</span>
								</div>
							{/if}
						</a>
					{/each}
				</div>
			</DeckUnit>
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
		pointer-events: none;
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
		margin: 0 0 0.75rem 0;
		color: #fff;
		line-height: 1;
		text-transform: uppercase;
	}

	/* Repositories & System Chips */
	.control-strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.75rem;
	}

	.sys-chip {
		display: flex;
		align-items: center;
		background: #111;
		border: 1px solid #333;
		border-radius: 4px;
		overflow: hidden;
		height: 24px;
	}
	.chip-label {
		background: #222;
		color: #666;
		padding: 0 8px;
		height: 100%;
		display: flex;
		align-items: center;
		border-right: 1px solid #333;
		font-weight: 700;
		font-size: 0.7rem;
	}
	.chip-label.icon-label {
		padding: 0 6px;
		color: #555;
	}
	.chip-value {
		color: #999;
		padding: 0 8px;
		white-space: nowrap;
		height: 100%;
		display: flex;
		align-items: center;
	}

	.status-light {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #555;
		box-shadow: 0 0 5px currentColor;
	}

	.status-light.public {
		background-color: var(--deck-success);
		box-shadow: 0 0 8px var(--deck-success);
		animation: pulse-green 2s infinite;
	}
	.status-light.internal {
		background-color: #f39c12;
		box-shadow: 0 0 8px #f39c12;
		animation: pulse-orange 2s infinite;
	}
	.status-light.private {
		background-color: var(--deck-danger);
		box-shadow: 0 0 8px var(--deck-danger);
		animation: pulse-red 2s infinite;
	}

	@keyframes pulse-green {
		0% {
			box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.4);
		}
		70% {
			box-shadow: 0 0 0 6px rgba(46, 204, 113, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(46, 204, 113, 0);
		}
	}
	@keyframes pulse-orange {
		0% {
			box-shadow: 0 0 0 0 rgba(243, 156, 18, 0.4);
		}
		70% {
			box-shadow: 0 0 0 6px rgba(243, 156, 18, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(243, 156, 18, 0);
		}
	}
	@keyframes pulse-red {
		0% {
			box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.4);
		}
		70% {
			box-shadow: 0 0 0 6px rgba(231, 76, 60, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(231, 76, 60, 0);
		}
	}

	.dim-ver {
		opacity: 0.5;
		margin-left: 4px;
		font-size: 0.9em;
	}

	.repo-actions {
		display: flex;
		gap: 0.5rem;
		/* Margin-left auto removed for left alignment */
	}

	.repo-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		text-decoration: none;
		padding: 4px 10px;
		border: 1px solid #333;
		background: rgba(0, 0, 0, 0.2);
		color: #888;
		border-radius: 4px;
		transition: all 0.2s ease;
		font-weight: 500;
		letter-spacing: 0.5px;
		height: 24px;
		box-sizing: border-box;
	}

	.repo-btn:hover {
		background: #222;
		color: #fff;
		border-color: #555;
	}

	.repo-btn.source:hover {
		border-color: #fff;
	}

	.repo-btn.community:hover {
		border-color: var(--deck-accent);
		color: var(--deck-accent);
	}

	/* Categories */
	.category-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 12px;
	}

	.category-tag {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid #333;
		border-radius: 4px;
		color: #888;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.7rem;
		text-decoration: none;
		transition: all 0.2s ease;
		text-transform: uppercase;
		font-weight: 500;
	}

	.category-tag:hover {
		color: #fff;
		border-color: var(--deck-accent);
		background: rgba(230, 126, 34, 0.05);
	}

	.tag-hash {
		color: var(--deck-accent);
		margin-right: 4px;
		opacity: 0.7;
	}
	.category-tag:hover .tag-hash {
		opacity: 1;
	}

	.updated-tag {
		color: #666;
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
	.ver-meta {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ver-date {
		font-size: 0.75rem;
		color: #555;
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

	/* --- Game Overlay & Loading States --- */
	.game-overlay {
		position: absolute;
		inset: 0;
		background: rgba(15, 15, 15, 0.95);
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease;
		backdrop-filter: blur(4px);
	}

	.game-overlay.active {
		opacity: 1;
		pointer-events: auto;
	}

	/* Initializing Spinner */
	.status-indicator {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		color: var(--deck-text);
		font-family: 'Orbitron', sans-serif;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top-color: var(--deck-accent);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Loading Terminal */
	.loading-terminal {
		width: 80%;
		max-width: 300px;
		font-family: 'Roboto Mono', monospace;
		color: var(--deck-accent);
	}

	.terminal-header {
		font-size: 0.7rem;
		color: #666;
		border-bottom: 1px solid #333;
		margin-bottom: 0.5rem;
		padding-bottom: 0.25rem;
	}

	.status-text {
		font-size: 0.9rem;
		margin-bottom: 1rem;
		min-height: 1.2em;
	}

	.blink {
		animation: blinker 1s linear infinite;
	}

	.progress-track {
		height: 6px;
		background: #111;
		border: 1px solid #444;
		margin-bottom: 0.5rem;
		position: relative;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--deck-accent);
		width: 0%;
		transition: width 0.1s linear;
		box-shadow: 0 0 10px var(--deck-accent);
	}

	.progress-numbers {
		font-size: 0.7rem;
		color: #666;
		text-align: right;
	}

	/* Error State */
	.error-panel {
		border: 1px solid var(--deck-danger);
		background: rgba(231, 76, 60, 0.1);
		padding: 2rem;
		text-align: center;
		max-width: 90%;
	}

	.error-title {
		color: var(--deck-danger);
		font-weight: 700;
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
		font-family: 'Orbitron', sans-serif;
	}

	.error-code {
		font-family: 'Roboto Mono', monospace;
		font-size: 0.8rem;
		color: #fff;
		background: var(--deck-danger);
		display: inline-block;
		padding: 2px 6px;
		margin-bottom: 1rem;
	}

	.error-msg {
		color: #ccc;
		font-size: 0.9rem;
		margin-bottom: 1.5rem;
	}

	.retry-btn {
		background: transparent;
		border: 1px solid var(--deck-text);
		color: var(--deck-text);
		padding: 0.5rem 1rem;
		cursor: pointer;
		font-family: 'Orbitron', sans-serif;
		transition: all 0.2s;
	}

	.retry-btn:hover {
		background: var(--deck-text);
		color: #000;
	}

	/* Permission Panel */
	.permission-panel {
		border-color: var(--deck-accent);
		background: rgba(230, 126, 34, 0.1);
	}

	.permission-panel .error-title {
		color: var(--deck-accent);
	}

	.permission-panel .error-code {
		background: var(--deck-accent);
	}

	@media (max-width: 768px) {
		.console-grid {
			grid-template-columns: 1fr;
		}
		.control-strip {
			flex-direction: column;
			align-items: flex-start;
		}
		.repo-actions {
			margin-left: 0;
			width: 100%;
		}
		.repo-btn {
			flex: 1;
			justify-content: center;
		}
	}
</style>
