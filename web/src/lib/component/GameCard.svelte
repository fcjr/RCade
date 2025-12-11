<script lang="ts">
	import { fly } from 'svelte/transition';
	import { getCapabilities, getCoverArt, getVisConfig } from '$lib/utils';

	export let game: any;
	export let index: number;

	const latest = game.versions[0];
	const plugins = getCapabilities(latest.dependencies);
	const visConfig = getVisConfig(latest.visibility);
</script>

<div class="deck-unit" in:fly={{ y: 40, duration: 600, delay: index * 100 }}>
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
						title={latest.authors.map((a: any) => a.display_name).join(', ')}
					>
						{latest.authors
							.map((a: any) => a.display_name.split(' ')[0])
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

<style>
	:root {
		--deck-bg: #1e2124;
		--deck-face: #282b30;
		--deck-accent: #e67e22;
		--deck-text: #aeb0b3;
	}

	/* --- The Cyber-Deck Unit --- */
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
</style>
