<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<section class={`steps-grid-section ${className}`}>
	<div class="steps-grid">
		{@render children()}
	</div>
</section>

<style>
	.steps-grid-section {
		padding: var(--spacing-2xl) 0;
	}

	.steps-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: var(--spacing-2xl);
	}

	@media (max-width: 768px) {
		.steps-grid {
			grid-template-columns: 1fr;
			gap: var(--spacing-lg);
		}
	}
</style>
