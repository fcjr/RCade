<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: Snippet;
		subtitle?: string;
		align?: 'center' | 'left';
		children?: Snippet;
		class?: string;
	}

	let { title, subtitle, align = 'center', children, class: className = '' }: Props = $props();

	const alignClass = align === 'center' ? 'section-header' : 'section-header-left';
</script>

<div class={`${alignClass} ${className}`}>
	<div>
		<h2>
			{@render title()}
		</h2>
		{#if subtitle}
			<p class="subtitle">{subtitle}</p>
		{/if}
	</div>

	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	:global(.section-header) {
		text-align: center;
		margin-bottom: var(--spacing-3xl);
	}

	:global(.section-header-left) {
		text-align: left;
		margin-bottom: var(--spacing-2xl);
	}

	:global(.section-header h2) {
		font-family: var(--font-heading);
		font-size: 2.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
		color: var(--color-text-primary);
	}

	:global(.section-header h3) {
		font-family: var(--font-heading);
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
		color: var(--color-text-primary);
	}

	:global(.section-header .subtitle),
	:global(.section-header p) {
		color: var(--color-text-secondary);
		font-size: 1.1rem;
		margin: 0;
	}

	:global(.section-header .highlight) {
		color: var(--color-primary);
	}
</style>
