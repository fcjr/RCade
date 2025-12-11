<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		header?: Snippet;
		footer?: Snippet;
		compact?: boolean;
		dense?: boolean;
		glass?: boolean;
		interactive?: boolean;
		children: Snippet;
	}

	let {
		class: className = '',
		header,
		footer,
		compact = false,
		dense = false,
		glass = false,
		interactive = false,
		children
	}: Props = $props();

	const baseClasses = [
		'card',
		compact && 'card-compact',
		dense && 'card-dense',
		glass && 'card-glass',
		interactive && 'card-interactive',
		className
	]
		.filter(Boolean)
		.join(' ');
</script>

<div class={baseClasses}>
	{#if header}
		<div class="card-header">
			{@render header()}
		</div>
	{/if}

	<div class="card-body">
		{@render children()}
	</div>

	{#if footer}
		<div class="card-footer">
			{@render footer()}
		</div>
	{/if}
</div>

<style>
	:global(.card) {
		background: var(--color-surface-card);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2xl);
		padding: var(--spacing-2xl);
		transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
		position: relative;
		overflow: hidden;
	}

	:global(.card:hover) {
		border-color: var(--color-border-hover);
		box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5);
		transform: translateY(-4px);
	}

	:global(.card-compact) {
		padding: var(--spacing-lg);
	}

	:global(.card-dense) {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	:global(.card-dense:hover) {
		background: rgba(0, 0, 0, 0.4);
		border-color: rgba(255, 255, 255, 0.2);
	}

	:global(.card-glass) {
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	:global(.card-glass:hover) {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.2);
	}

	:global(.card-interactive) {
		cursor: pointer;
	}

	:global(.card-interactive:hover) {
		transform: translateY(-8px);
		box-shadow:
			0 20px 40px -10px rgba(0, 0, 0, 0.5),
			0 0 0 1px var(--color-primary);
	}

	:global(.card-header) {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	:global(.card-body) {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	:global(.card-footer) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}
</style>
