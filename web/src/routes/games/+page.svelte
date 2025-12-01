<script lang="ts">
	import { fade, fly } from 'svelte/transition';

	// --- Mock Data (Unchanged) ---
	const games = [
		{
			id: 'g_001',
			name: 'snake-evolved',
			git: { ssh: '...', https: '...' },
			owner_rc_id: 'rc_user_1',
			versions: [
				{
					displayName: 'Snake Evolved',
					description: 'Physics-based movement matrix. Survival mode active.',
					visibility: 'public',
					version: '2.1.0',
					authors: [{ display_name: 'Claire Froelich' }, { display_name: 'Jack Ratner' }],
					dependencies: [
						{ name: 'bevy', version: '0.12' },
						{ name: '@rcade/input-classic', version: '1.0.0' },
						{ name: '@rcade/marquee', version: '1.0.0' }
					],
					categories: ['ARCADE', 'ACTION'],
					contents: { url: '/game-builds/snake.wasm', expires: 123456789 }
				}
			]
		},
		{
			id: 'g_002',
			name: 'micro-engine',
			git: { ssh: '...', https: '...' },
			owner_rc_id: 'rc_user_2',
			versions: [
				{
					displayName: 'miRCo Engine',
					description: 'Fantasy console engine. Lua interpreter online.',
					visibility: 'public',
					version: '1.0.4',
					authors: [{ display_name: 'Greg Sadetsky' }, { display_name: 'Jonathan Rippy' }],
					dependencies: [
						{ name: '@rcade/input-keyboard', version: '1.0.0' },
						{ name: '@rcade/threads', version: '1.2.0' }
					],
					categories: ['TOOLS', 'ENGINE'],
					contents: { url: '/game-builds/mirco.wasm', expires: 123456789 }
				}
			]
		},
		{
			id: 'g_003',
			name: 'pixel-racer',
			git: { ssh: '...', https: '...' },
			owner_rc_id: 'rc_user_3',
			versions: [
				{
					displayName: 'Pixel Racer 2049',
					description: 'Anti-gravity racing protocol. Global sync enabled.',
					visibility: 'internal',
					version: '0.8.2-beta',
					authors: [{ display_name: 'SpeedDemon' }],
					dependencies: [
						{ name: 'godot', version: '4.2' },
						{ name: '@rcade/input-gamepad', version: '1.0.0' }
					],
					categories: ['RACING', 'NET'],
					remixOf: { name: 'snake-evolved' }
				}
			]
		},
		{
			id: 'g_004',
			name: 'void-drifter',
			git: { ssh: '...', https: '...' },
			owner_rc_id: 'rc_user_4',
			versions: [
				{
					displayName: 'Void Drifter',
					description: 'Minimalist puzzle. Zero-G environment simulation.',
					visibility: 'public',
					version: '1.0.0',
					authors: [{ display_name: 'ZenMaster' }],
					dependencies: [{ name: '@rcade/input-classic', version: '1.0.0' }],
					categories: ['PUZZLE', 'RELAX']
				}
			]
		},
		{
			id: 'g_005',
			name: 'dungeon-crawler-js',
			git: { ssh: '...', https: '...' },
			owner_rc_id: 'rc_user_5',
			versions: [
				{
					displayName: 'Deep Dark DGN',
					description: 'Roguelike exploration. Vanilla JS kernel loaded.',
					visibility: 'private',
					version: '3.0.1',
					authors: [{ display_name: 'WebWizard' }],
					dependencies: [{ name: '@rcade/input-mouse', version: '1.0.0' }],
					categories: ['RPG', 'ROGUE']
				}
			]
		}
	];

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

	// --- Updated Mapping for Clarity ---
	function getCapabilities(dependencies: any[]) {
		const pluginMap: Record<string, string> = {
			'@rcade/input-classic': 'ARCADEARCADEARCADE',
			'@rcade/input-gamepad': 'GAMEPAD',
			'@rcade/input-mouse': 'MOUSE',
			'@rcade/input-keyboard': 'KEYBOARD',
			'@rcade/threads': 'THREADS',
			'@rcade/marquee': 'MARQUEE'
		};
		return dependencies.map((d) => pluginMap[d.name] || d.name.toUpperCase()).filter(Boolean);
	}

	// --- Updated Visibility Helpers ---
	function getVisConfig(visibility: string) {
		switch (visibility) {
			case 'public':
				return { label: 'GLOBAL', class: 'vis-public', icon: '●' };
			case 'internal':
				return { label: 'HUB', class: 'vis-internal', icon: '▲' };
			case 'private':
			default:
				return { label: 'LOCAL', class: 'vis-private', icon: '■' };
		}
	}
</script>

<div class="games-page">
	<section class="library-header" in:fly={{ y: 20, duration: 600 }}>
		<div class="title-block">
			<h1>Arcade<br /><span class="outline">Library</span></h1>
		</div>

		<div class="controls">
			<div class="search-bar">
				<div class="icon">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"
						></line></svg
					>
				</div>
				<input type="text" placeholder="Find a game..." />
				<div class="command-hint">/</div>
			</div>

			<div class="filter-pills">
				<button class="pill active">All</button>
				<button class="pill">Action</button>
				<button class="pill">Puzzle</button>
				<button class="pill">Tools</button>
			</div>
		</div>
	</section>
	<section class="games-grid">
		{#each games as game, i (game.id)}
			{@const latest = game.versions[0]}
			{@const plugins = getCapabilities(latest.dependencies)}
			{@const visConfig = getVisConfig(latest.visibility)}

			<div class="deck-unit" in:fly={{ y: 40, duration: 600, delay: i * 100 }}>
				<div class="mount-holes">
					<div class="screw"></div>
					<div class="serial-no">{game.name}@{game.versions[0].version}</div>
					<div class="screw"></div>
				</div>

				<div class="bezel-housing">
					<div class="monitor-frame">
						<div class="screen-glare"></div>
						<div class="crt-surface" style={getCoverArt(game.name)}>
							{#if 'remixOf' in latest && latest.remixOf}
								<div class="remix-tag">
									<div class="stripe"></div>
									<span>REMIX</span>
								</div>
							{/if}
						</div>
						<div class="screen-label">DISPLAY 336x262</div>
					</div>

					<div class="panel-readout">
						<div class="spec-grid">
							<div class="cell full">
								<span class="cell-label">NAME</span>
								<span class="cell-value highlight">{latest.displayName ?? game.name}</span>
							</div>

							<div class="cell">
								<span class="cell-label">VERSION</span>
								<span class="cell-value mono">{latest.version}</span>
							</div>

							<div class="cell">
								<span class="cell-label">AUTHORS</span>
								<span
									class="cell-value mono"
									title={latest.authors.map((a) => a.display_name).join(', ')}
								>
									{latest.authors
										.map((a) => a.display_name.split(' ')[0])
										.join(', ')
										.toUpperCase()}
								</span>
							</div>

							<div class="cell full">
								<span class="cell-label">DESCRIPTION</span>
								<p class="cell-text">{latest.description}</p>
							</div>

							<div class="cell">
								<span class="cell-label">VISIBILITY</span>
								<div class="vis-badge {visConfig.class}">
									<span class="vis-icon">{visConfig.icon}</span>
									<span class="vis-text">{visConfig.label}</span>
								</div>
							</div>

							<div class="cell">
								<span class="cell-label">PLUGINS</span>
								<div class="io-badges">
									{#each plugins as p}
										<span class="io-tag">{p}</span>
									{/each}
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="unit-footer">
					<div class="grip-texture"></div>
					<a class="eject-btn" href="/games/a">PLAY</a>
				</div>
			</div>
		{/each}
	</section>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Orbitron:wght@500;700&family=Roboto+Mono:wght@400;500&display=swap');

	:root {
		--deck-bg: #1e2124;
		--deck-face: #282b30;
		--deck-accent: #e67e22;
		--deck-text: #aeb0b3;
	}

	/* --- Standard Header CSS (Same as before) --- */
	.games-page {
		padding: 4rem 2rem;
		max-width: 1400px;
		margin: 0 auto;
		min-height: 100vh;
	}
	.library-header {
		display: flex;
		flex-direction: column;
		gap: 3rem;
		margin-bottom: 5rem;
		align-items: center;
		text-align: center;
	}
	.title-block h1 {
		font-family: 'Syne', sans-serif;
		font-size: clamp(3rem, 8vw, 5rem);
		font-weight: 800;
		line-height: 0.9;
		margin: 0;
		color: #fff;
		letter-spacing: -0.03em;
	}
	.outline {
		color: transparent;
		-webkit-text-stroke: 2px rgba(255, 255, 255, 0.2);
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
		max-width: 600px;
	}
	.search-bar {
		position: relative;
		display: flex;
		align-items: center;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 100px;
		padding: 0.5rem 0.75rem;
		transition: all 0.3s;
	}
	.search-bar:focus-within {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(250, 204, 21, 0.5);
	}
	.icon {
		color: rgba(255, 255, 255, 0.4);
		padding: 0 0.5rem;
	}
	.search-bar input {
		background: transparent;
		border: none;
		color: #fff;
		font-family: 'DM Sans', sans-serif;
		font-size: 1.1rem;
		flex: 1;
		outline: none;
		padding: 0.5rem;
	}
	.command-hint {
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		margin-right: 0.5rem;
	}
	.filter-pills {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.pill {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.6);
		padding: 0.5rem 1.25rem;
		border-radius: 100px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}
	.pill:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.05);
	}
	.pill.active {
		background: #facc15;
		color: #0a0a0a;
		border-color: #facc15;
		font-weight: 700;
	}

	/* --- The Cyber-Deck Unit --- */
	.games-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 3rem;
	}

	.deck-unit {
		background-color: var(--deck-bg);
		border-radius: 4px;
		box-shadow:
			0 10px 20px rgba(0, 0, 0, 0.5),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transition: transform 0.2s;
		font-family: 'Chakra Petch', sans-serif;
	}

	.deck-unit:hover {
		transform: translateY(-4px);
	}

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

	.bezel-housing {
		padding: 1rem;
		background: var(--deck-face);
		border-left: 2px solid rgba(255, 255, 255, 0.05);
		border-right: 2px solid rgba(0, 0, 0, 0.2);
		flex-grow: 1;
	}

	.monitor-frame {
		background: #111;
		padding: 10px 10px 24px 10px;
		border-radius: 2px;
		position: relative;
		box-shadow: inset 0 0 10px #000;
		margin-bottom: 1rem;
	}

	.screen-label {
		position: absolute;
		bottom: 6px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.55rem;
		color: #444;
		letter-spacing: 1px;
	}

	.crt-surface {
		width: 100%;
		aspect-ratio: 336 / 262;
		position: relative;
		overflow: hidden;
		border-radius: 2px;
		filter: brightness(0.9) contrast(1.1);
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

	.remix-tag {
		position: absolute;
		top: 8px;
		right: 8px;
		background: var(--deck-accent);
		color: #000;
		font-size: 0.6rem;
		font-weight: 800;
		padding: 2px 6px;
		display: flex;
		align-items: center;
		gap: 4px;
		box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
	}
	.stripe {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: #000;
	}

	.panel-readout {
		margin-top: 0.5rem;
	}

	.spec-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		background: #15171a;
		border: 1px solid #333;
		gap: 1px;
		background-color: #333;
	}

	.cell {
		background-color: #23262b;
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 50px;
		justify-content: start;
	}

	.cell.full {
		grid-column: span 2;
	}

	.cell-label {
		font-family: 'Roboto Mono', monospace;
		font-size: 0.55rem;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.cell-value {
		font-family: 'Chakra Petch', sans-serif;
		color: #ccc;
		font-size: 0.9rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cell-value.highlight {
		color: var(--deck-accent);
		font-size: 1rem;
		font-weight: 700;
	}

	.cell-value.mono {
		font-family: 'Roboto Mono', monospace;
		font-size: 0.8rem;
		color: #888;
	}

	.cell-text {
		font-size: 0.75rem;
		color: #999;
		margin: 0;
		line-height: 1.3;
		font-family: 'Roboto Mono', monospace;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* --- New Visibility Badges --- */
	.vis-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: 'Orbitron', sans-serif;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 2px 0;
	}

	/* Public: Green/Blue Global vibe */
	.vis-badge.vis-public {
		color: #2ecc71;
		text-shadow: 0 0 5px rgba(46, 204, 113, 0.3);
	}

	/* Internal: Amber/Warning vibe */
	.vis-badge.vis-internal {
		color: #f1c40f;
		text-shadow: 0 0 5px rgba(241, 196, 15, 0.3);
	}

	/* Private: Red/Offline vibe */
	.vis-badge.vis-private {
		color: #e74c3c;
		text-shadow: 0 0 5px rgba(231, 76, 60, 0.3);
	}

	.vis-icon {
		font-size: 0.6rem;
	}

	/* --- New I/O Tags --- */
	.io-badges {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.io-tag {
		font-size: 0.6rem;
		background: #36393e;
		color: #bbb;
		padding: 3px 6px;
		border: 1px solid #444;
		border-radius: 2px;
		/* Ensure font is condensed to fit more text */
		font-family: 'Roboto Mono', monospace;
		letter-spacing: -0.5px;
	}

	.unit-footer {
		background: #15171a;
		padding: 10px 1rem;
		border-top: 1px solid #000;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.grip-texture {
		width: 40px;
		height: 12px;
		background-image: linear-gradient(90deg, #333 1px, transparent 1px);
		background-size: 4px 100%;
	}

	.eject-btn {
		background: transparent;
		border: 1px solid var(--deck-accent);
		color: var(--deck-accent);
		font-family: 'Chakra Petch', sans-serif;
		font-weight: 700;
		font-size: 0.75rem;
		padding: 4px 12px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.eject-btn:hover {
		background: var(--deck-accent);
		color: #000;
		box-shadow: 0 0 10px rgba(230, 126, 34, 0.3);
	}

	@media (max-width: 640px) {
		.games-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
