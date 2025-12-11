<script>
	import PlayInv from '$lib/icons/play-inv.svelte';

	let {
		title = 'Game Title',
		authors = ['Author Names'],
		backgroundImage = '/micro.png',
		badge = 'MOST LOVED',
		onPlay = () => {}
	} = $props();
</script>

<div class="deck-card">
	<div class="mount-strip">
		<div class="screw"></div>
		<div class="serial-no">{badge}</div>
		<div class="screw"></div>
	</div>

	<div class="monitor-housing">
		<div class="monitor-bezel">
			<button
				class="crt-surface"
				style="background-image: url('{backgroundImage}')"
				onclick={() => onPlay()}
				aria-label="Play {title}"
			>
				<div class="hud-overlay">
					<div class="play-trigger">
						<span class="blink-text">PLAY</span>
						<PlayInv size={24} color="#000" />
					</div>
				</div>
			</button>
		</div>
	</div>

	<div class="data-plate">
		<div class="plate-header">
			<h1 class="title-text">{title}</h1>
		</div>
		<div class="plate-body">
			<span class="label">AUTHORS //</span>
			<span class="value">{authors.join(', ')}</span>
		</div>
	</div>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Orbitron:wght@500;700&family=Roboto+Mono:wght@400;700&display=swap');

	:root {
		--deck-bg: #1e2124;
		--deck-face: #282b30;
		--deck-accent: #e67e22;
		--deck-success: #2ecc71;
		--deck-text: #aeb0b3;
	}

	/* --- Main Container (The Hardware Unit) --- */
	.deck-card {
		display: flex;
		flex-direction: column;
		background-color: var(--deck-bg);
		border-radius: 4px;
		box-shadow: 0 10px 20px rgba(0, 0, 0, 0.5);
		border: 1px solid #111;
		font-family: 'Chakra Petch', sans-serif;
		overflow: hidden;
		position: relative;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.deck-card:hover {
		transform: translateY(-4px);
		box-shadow:
			0 15px 30px rgba(0, 0, 0, 0.7),
			0 0 0 1px var(--deck-accent);
	}

	/* --- The Mounting Strip (Top) --- */
	.mount-strip {
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
		font-family: 'Orbitron', sans-serif;
		font-size: 0.6rem;
		color: var(--deck-accent);
		letter-spacing: 2px;
		font-weight: 700;
		text-shadow: 0 0 5px rgba(230, 126, 34, 0.4);
	}

	/* --- Monitor Housing --- */
	.monitor-housing {
		padding: 12px;
		background: var(--deck-face);
		border-bottom: 1px solid #000;
	}

	.monitor-bezel {
		background: #111;
		padding: 8px; /* Inner bezel depth */
		border-radius: 4px;
		border: 1px solid #333;
		box-shadow: inset 0 0 10px #000;
	}

	/* --- CRT Surface & Interactions --- */
	.crt-surface {
		position: relative;
		width: 100%;
		aspect-ratio: 336/262; /* Strict Ratio */
		background-size: cover;
		background-position: center;
		background-color: #000;
		border: none;
		cursor: pointer;
		display: block;
		padding: 0;
		overflow: hidden;
		image-rendering: pixelated;
	}

	/* --- HUD Overlay --- */
	.hud-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s ease;
		z-index: 4;
		/* backdrop-filter: blur(2px); */
	}

	.deck-card:hover .hud-overlay {
		opacity: 1;
	}

	.play-trigger {
		background: var(--deck-success);
		color: #000;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		font-family: 'Orbitron', sans-serif;
		font-weight: 900;
		font-size: 0.9rem;
		/* Technical angled cut */
		clip-path: polygon(
			10px 0,
			100% 0,
			100% calc(100% - 10px),
			calc(100% - 10px) 100%,
			0 100%,
			0 10px
		);
		transform: scale(0.9);
		transition: transform 0.1s;
		box-shadow: 0 0 15px rgba(46, 204, 113, 0.5);
	}

	.play-trigger:hover {
		transform: scale(1);
		background: #fff;
	}

	.blink-text {
		animation: blinker 1s linear infinite;
	}

	@keyframes blinker {
		50% {
			opacity: 0.5;
		}
	}

	/* --- Data Footer --- */
	.data-plate {
		background: var(--deck-face);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.plate-header {
		border-left: 3px solid var(--deck-accent);
		padding-left: 8px;
	}

	.title-text {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
		color: #fff;
		text-transform: uppercase;
		line-height: 1;
		font-family: 'Chakra Petch', sans-serif;
	}

	.plate-body {
		display: flex;
		align-items: start;
		gap: 6px;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.7rem;
		color: #666;
		padding-left: 11px; /* Align with text above (3px border + 8px padding) */
	}

	.label {
		color: var(--deck-accent);
		font-weight: 700;
		flex-shrink: 0;
	}

	.value {
		color: var(--deck-text);
	}
</style>
