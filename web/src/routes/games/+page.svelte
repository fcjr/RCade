<script lang="ts">
	import { fly } from 'svelte/transition';
	import { games } from '$lib/mock-data';
	import GameCard from '$lib/component/GameCard.svelte';
</script>

<div class="games-page">
	<section class="library-header" in:fly={{ y: 20, duration: 600 }}>
		<div class="marquee-board">
			<div class="led-grid"></div>
			<h1>ARCADE LIBRARY</h1>
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
					>
						<circle cx="11" cy="11" r="8"></circle>
						<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
					</svg>
				</div>
				<input type="text" placeholder="Search..." />
				<div class="command-hint">/</div>
			</div>

			<div class="filter-pills">
				<button class="pill active">ALL</button>
				<button class="pill">ACTION</button>
				<button class="pill">PUZZLE</button>
				<button class="pill">TOOLS</button>
			</div>
		</div>
	</section>

	<section class="games-grid">
		{#each games as game, i (game.id)}
			<GameCard {game} index={i} />
		{/each}
	</section>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Jersey+15&family=Chakra+Petch:wght@500;600;700&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap');

	.games-page {
		padding: 4rem 2rem;
		max-width: 1400px;
		margin: 0 auto;
		min-height: 100vh;
	}

	.library-header {
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
		margin-bottom: 4rem;
		align-items: center;
		width: 100%;
	}

	/* --- The LED Marquee Board --- */
	.marquee-board {
		position: relative;
		width: 100vw;
		background: #050505;
		border-top: 2px solid #333;
		border-bottom: 2px solid #333;
		padding: 1.5rem 2rem;
		display: flex;
		justify-content: center;
		align-items: center;
		overflow: hidden;
		/* Outer glow for the physical unit feel */
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
	}

	/* The Dot Matrix Texture */
	.led-grid {
		position: absolute;
		inset: 0;
		opacity: 0.2;
		background-image: radial-gradient(#333 1px, transparent 1px);
		background-size: 4px 4px;
		pointer-events: none;
	}

	.marquee-board h1 {
		position: relative; /* Sit above grid */
		font-family: 'Jersey 15', sans-serif;
		font-size: clamp(3rem, 6vw, 5rem);
		color: #facc15; /* Amber LED */
		margin: 0;
		line-height: 1;
		letter-spacing: 0.05em;
		text-align: center;

		/* The LED Glow */
		text-shadow:
			0 0 5px rgba(250, 204, 21, 0.5),
			0 0 10px rgba(250, 204, 21, 0.3),
			0 0 20px rgba(250, 204, 21, 0.1);

		/* Crisp Pixels */
		-webkit-font-smoothing: none;
	}

	/* --- Controls --- */
	.controls {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
		max-width: 600px;
	}

	.search-bar {
		display: flex;
		align-items: center;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px; /* Squarer tech look */
		padding: 0.75rem 1rem;
		transition: border-color 0.2s;
	}

	.search-bar:focus-within {
		border-color: #facc15;
		background: rgba(0, 0, 0, 0.5);
	}

	.icon {
		color: rgba(255, 255, 255, 0.4);
		padding-right: 0.75rem;
	}

	.search-bar input {
		background: transparent;
		border: none;
		color: #fff;
		font-family: 'Chakra Petch', sans-serif; /* Tech font */
		font-size: 1rem;
		letter-spacing: 0.05em;
		flex: 1;
		outline: none;
		text-transform: uppercase;
	}

	.search-bar input::placeholder {
		color: rgba(255, 255, 255, 0.2);
	}

	.command-hint {
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.05);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.filter-pills {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.pill {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.5);
		padding: 0.5rem 1.25rem;
		border-radius: 4px;
		font-family: 'Chakra Petch', sans-serif;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.pill:hover {
		background: rgba(250, 204, 21, 0.1);
		color: #facc15;
		border-color: rgba(250, 204, 21, 0.3);
	}

	.pill.active {
		background: #facc15;
		color: #000;
		border-color: #facc15;
	}

	/* --- Grid --- */
	.games-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 2rem;
	}

	@media (max-width: 640px) {
		.games-grid {
			grid-template-columns: 1fr;
		}
		.marquee-board {
			padding: 1rem;
		}
	}
</style>
