<script lang="ts">
	import SearchInput from '../common/SearchInput.svelte';
	import FilterPill from '../common/FilterPill.svelte';

	interface Props {
		searchValue?: string;
		activeFilter?: string;
		onSearch?: (value: string) => void;
		onFilter?: (filter: string) => void;
		class?: string;
	}

	let {
		searchValue = '',
		activeFilter = 'ALL',
		onSearch,
		onFilter,
		class: className = ''
	}: Props = $props();

	const filters = ['ALL', 'ACTION', 'PUZZLE', 'TOOLS'];
</script>

<div class={`search-controls ${className}`}>
	<SearchInput value={searchValue} placeholder="Search games..." onchange={onSearch} />

	<div class="filter-pills">
		{#each filters as filter}
			<FilterPill active={filter === activeFilter} onclick={() => onFilter?.(filter)}>
				{filter}
			</FilterPill>
		{/each}
	</div>
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
