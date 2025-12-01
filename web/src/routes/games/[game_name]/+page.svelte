<script lang="ts">
	import { fade, fly } from 'svelte/transition';

	// --- Mock Data (Updated) ---
	const game = {
		id: 'g_001',
		name: 'snake-evolved',
		displayName: 'Snake Evolved',
		version: '2.1.0', // Current loaded version
		updatedAt: '2023-10-24',
		// New: Multiple Authors with optional metadata
		authors: [
			{
				id: 'rc_user_1',
				name: 'Demo User',
				role: 'Core Logic',
				image: 'https://i.pravatar.cc/150?u=rc_user_1'
			},
			{
				name: 'Another User'
				// No image provided for this user
			}
		],
		// New: Version History
		versionHistory: [
			{ id: '2.1.0', label: 'Release', date: 'Oct 24', current: true },
			{ id: '2.0.5', label: 'Beta', date: 'Oct 10', current: false },
			{ id: '1.9.0', label: 'Legacy', date: 'Sep 01', current: false }
		],
		description:
			'Physics-based movement matrix. Survival mode active. Navigate the grid, consume data packets, and avoid tail-collision events.',
		instructions:
			'USE [W,A,S,D] OR [ARROW KEYS] FOR TRAVERSAL.\nPRESS [SPACE] TO ENGAGE BOOST MECHANIC.\nAVOID CORRUPTION ZONES.',
		notes:
			'Version 2.1.0 patches the infinite length glitch. Special thanks to @JackRatner for the audio synthesis module.',
		views: 4021,
		likes: 355,
		remixes: 12,
		visibility: 'public',
		dependencies: [
			{ name: 'bevy', version: '0.12' },
			{ name: '@rcade/input-classic', version: '1.0.0' }
		],
		comments: [
			{
				user: 'RetroKing',
				text: 'Lag on level 5 is crazy optimized now. Good job.',
				time: '2h ago'
			},
			{ user: 'NeonDrifter', text: 'Can I fork this for the jam?', time: '5h ago' }
		]
	};

	function getCoverArt(name: string) {
		const colors = ['#D24D57', '#2C3E50', '#e67e22', '#27ae60'];
		const c = colors[name.length % colors.length];
		return `
            background-color: ${c};
            background-image: 
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px);
            background-size: 20px 20px;
        `;
	}

	// Helper to get initials for users without images
	function getInitials(name: string) {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.substring(0, 2)
			.toUpperCase();
	}
</script>

<div class="game-detail-page">
	<nav class="nav-bar" in:fly={{ y: -20, duration: 500 }}>
		<a href="/games" class="back-link">&lt; // GAMES</a>
		<span class="path-separator">/</span>
		<span class="current-path">{game.id.toUpperCase()}</span>
	</nav>

	<main class="console-grid">
		<section class="stage-column" in:fly={{ x: -20, duration: 600, delay: 100 }}>
			<div class="deck-unit full-size">
				<div class="mount-holes top">
					<div class="screw"></div>
					<div class="serial-no">DISPLAY_UNIT_PRIMARY</div>
					<div class="screw"></div>
				</div>

				<div class="bezel-housing">
					<div class="monitor-frame large">
						<div class="crt-surface" style={getCoverArt(game.name)}>
							<div class="screen-glare"></div>
							<div class="overlay-ui">
								<div class="click-to-start">
									<button class="play-trigger">PLAY</button>
								</div>
							</div>
						</div>

						<div class="bezel-label">RES: 336x262 | REFRESH: 60HZ</div>
					</div>
				</div>
			</div>
		</section>

		<section class="info-column" in:fly={{ x: 20, duration: 600, delay: 200 }}>
			<div class="header-panel">
				<h1 class="game-title">{game.displayName}</h1>
				<div class="meta-row">
					<span class="updated-tag">LAST UPDATE: {game.updatedAt}</span>
					<span class="updated-tag">ID: {game.id}</span>
				</div>
			</div>

			<div class="deck-unit info-unit">
				<div class="mount-holes">
					<div class="screw"></div>
					<div class="serial-no">AUTHORS</div>
					<div class="screw"></div>
				</div>
				<div class="panel-body table-body">
					{#each game.authors as author}
						<div class="author-row">
							<div class="author-avatar">
								{#if author.image}
									<img src={author.image} alt={author.name} />
								{:else}
									<div class="avatar-placeholder">{getInitials(author.name)}</div>
								{/if}
							</div>
							<div class="author-details">
								<span class="author-name">{author.name}</span>
								{#if author.role}
									<span class="author-role">[{author.role}]</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="deck-unit info-unit">
				<div class="mount-holes">
					<div class="screw"></div>
					<div class="serial-no">DESCRIPTION</div>
					<div class="screw"></div>
				</div>
				<div class="panel-body">
					<p class="desc-text">{game.description}</p>
				</div>
			</div>

			<div class="deck-unit info-unit">
				<div class="mount-holes">
					<div class="screw"></div>
					<div class="serial-no">VERSIONS</div>
					<div class="screw"></div>
				</div>
				<div class="panel-body list-body">
					{#each game.versionHistory as ver}
						<a href="./{ver.id}" class="version-row" class:active={ver.id === game.version}>
							<div class="ver-info">
								<span class="ver-id">v{ver.id}</span>
							</div>
							<div class="ver-meta">
								<span class="ver-date">{ver.date}</span>
							</div>
						</a>
					{/each}
				</div>
			</div>

			<div class="tags-panel">
				{#each game.dependencies as dep}
					<span class="tech-pill">{dep.name}@{dep.version}</span>
				{/each}
				<span class="tech-pill vis-public">PUBLIC_ACCESS</span>
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

	/* --- Controls & Monitor (Unchanged styles compressed for brevity) --- */
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
	.crt-surface {
		width: 100%;
		aspect-ratio: 336 / 262;
		position: relative;
		border-radius: 2px;
		overflow: hidden;
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
		clip-path: polygon(
			10px 0,
			100% 0,
			100% calc(100% - 10px),
			calc(100% - 10px) 100%,
			0 100%,
			0 10px
		);
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
	.info-column {
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

	.info-unit {
		background: var(--deck-bg);
		border: 1px solid #000;
	}
	.info-unit .panel-body {
		padding: 1rem;
		background: var(--deck-face);
		border-left: 2px solid rgba(255, 255, 255, 0.05);
	}

	/* --- NEW: Version List Styling --- */
	.list-body {
		padding: 0 !important; /* Reset padding for list */
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

	/* --- NEW: Authors Table Styling --- */
	.table-body {
		padding: 0.5rem 1rem !important;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.author-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0;
		border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
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

	/* --- Description & Tags --- */
	.desc-text {
		font-size: 0.9rem;
		line-height: 1.5;
		color: #aeb0b3;
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

	/* Common Helpers */
	.mount-holes {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: #15171a;
		border-bottom: 1px solid #000;
	}
	.screw {
		width: 10px;
		height: 10px;
		background: #333;
		border-radius: 50%;
		box-shadow: inset 1px 1px 2px #000;
		position: relative;
	}
	.screw::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 1px;
		right: 1px;
		height: 1px;
		background: #555;
		transform: rotate(-45deg);
	}
	.serial-no {
		font-size: 0.6rem;
		color: #555;
		letter-spacing: 2px;
		font-weight: 700;
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
		.crt-surface {
			aspect-ratio: 16/9;
		}
	}
</style>
