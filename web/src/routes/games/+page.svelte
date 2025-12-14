<script lang="ts">
	import { fly } from 'svelte/transition';
	import GameCard from '$lib/component/GameCard.svelte';
	import SearchControls from '$lib/component/sections/SearchControls.svelte';
	import type { PageData } from './$types';
	import type { Game } from '@rcade/api';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let searchQuery = $derived(page.url.searchParams.get('q') ?? '');
	let activeFilters: string[] = $derived(page.url.searchParams.getAll('c'));

	function handleSearch(value: string) {
		if (value) {
			page.url.searchParams.set('q', value);
		} else {
			page.url.searchParams.delete('q');
		}

		goto(page.url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	function handleFilter(filters: string[]) {
		if (filters.length > 0) {
			page.url.searchParams.delete('c');
			filters.forEach((filter) => {
				page.url.searchParams.append('c', filter);
			});
		} else {
			page.url.searchParams.delete('c');
		}

		goto(page.url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	const filters = $derived.by(() => {
		return data.games
			.map((game) => game.latest())
			.map((version) => version.categories())
			.flat()
			.map((category) => category.name)
			.filter((value, index, self) => self.indexOf(value) === index)
			.sort();
	});

	function matchesFilter(game: Game, query: string, filter: string[]) {
		const latest = game.latest();

		const nameMatch = (latest.displayName() ?? game.name())
			.toLowerCase()
			.includes(query.toLowerCase());

		const categoryMatch =
			filter.length === 0 ||
			filter.every((f) =>
				latest
					.categories()
					.map((c) => c.name)
					.includes(f)
			);

		return nameMatch && categoryMatch;
	}
</script>

<div class="games-page">
	<section class="library-header" in:fly={{ y: 20, duration: 600 }}>
		<div class="marquee-board">
			<div class="led-grid"></div>
			<h1>@RCADE LIBRARY</h1>
		</div>

		<div class="controls">
			<SearchControls
				bind:searchValue={searchQuery}
				onSearch={handleSearch}
				onFilter={handleFilter}
				{filters}
				{activeFilters}
			/>
		</div>
	</section>

	<div class="container">
		<section class="games-grid">
			{#each data.games as game, i (game.id())}
				{#if matchesFilter(game, searchQuery, activeFilters)}
					<div in:fly={{ y: 20, duration: 400, delay: i * 50 }}>
						<GameCard {game} index={i} />
					</div>
				{/if}
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
