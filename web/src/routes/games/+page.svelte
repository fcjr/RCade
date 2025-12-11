<script lang="ts">
	import { fly } from 'svelte/transition';
	import GameCard from '$lib/component/GameCard.svelte';
	import SearchControls from '$lib/component/sections/SearchControls.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let activeFilter = $state('ALL');

	function handleSearch(value: string) {
		searchQuery = value;
	}

	function handleFilter(filter: string) {
		activeFilter = filter;
	}
</script>

<div class="games-page">
	<section class="library-header" in:fly={{ y: 20, duration: 600 }}>
		<div class="marquee-board">
			<div class="led-grid"></div>
			<h1>ARCADE LIBRARY</h1>
		</div>

		<div class="controls">
			<SearchControls
				searchValue={searchQuery}
				{activeFilter}
				onSearch={handleSearch}
				onFilter={handleFilter}
			/>
		</div>
	</section>

	<div class="container">
		<section class="games-grid">
			{#each data.games as game, i (game.id())}
				<GameCard {game} index={i} />
			{/each}
		</section>
	</div>
</div>

<style>
	.games-page {
		min-height: 100vh;
		position: relative;
	}

	/* --- The LED Marquee Board --- */
	.library-header {
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
		margin-top: var(--spacing-3xl);
		margin-bottom: var(--spacing-3xl);
		align-items: center;
		width: 100%;
	}

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
		position: relative;
		font-family: var(--font-title);
		font-size: clamp(3rem, 6vw, 5rem);
		color: var(--color-primary);
		margin: 0;
		line-height: 1;
		letter-spacing: 0.05em;
		text-align: center;
		text-shadow:
			0 0 5px rgba(250, 204, 21, 0.5),
			0 0 10px rgba(250, 204, 21, 0.3),
			0 0 20px rgba(250, 204, 21, 0.1);
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

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 2rem;
		position: relative;
		z-index: 2;
	}

	.games-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--spacing-2xl);
		padding: var(--spacing-3xl) 0;
	}

	@media (max-width: 768px) {
		.marquee-board {
			padding: 1rem;
		}

		.controls {
			width: 100%;
		}

		.games-grid {
			gap: var(--spacing-lg);
		}
	}

	@media (max-width: 640px) {
		.container {
			padding: 0 1rem;
		}

		.games-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
