<script lang="ts">
	import SearchInput from '../common/SearchInput.svelte';
	import FilterPill from '../common/FilterPill.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		searchValue?: string;
		onSearch?: (value: string) => void;
		onFilter?: (filters: string[]) => void;
		class?: string;
		filters?: string[];
		activeFilters?: string[];
	}

	let {
		searchValue = $bindable(''),
		onSearch,
		onFilter,
		class: className = '',
		filters = $bindable([]),
		activeFilters = $bindable([])
	}: Props = $props();
</script>

<div class={`search-controls ${className}`}>
	<SearchInput
		bind:value={searchValue}
		placeholder="Search games..."
		onchange={onSearch}
		oninput={onSearch}
	/>

	{#if filters.length > 0}
		<div class="filter-pills">
			{#each filters as filter}
				<FilterPill
					active={activeFilters.includes(filter)}
					onclick={() => {
						if (!onFilter) return;

						const filterSet = new SvelteSet(activeFilters);

						if (filterSet.has(filter)) {
							filterSet.delete(filter);
						} else {
							filterSet.add(filter);
						}

						onFilter(Array.from(filterSet));
					}}
				>
					{filter}
				</FilterPill>
			{/each}
		</div>
	{/if}
</div>

<style>
	.search-controls {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
	}

	.filter-pills {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
