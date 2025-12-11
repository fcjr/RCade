<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		elevated?: boolean;
		dense?: boolean;
		interactive?: boolean;
		children: Snippet;
	}

	let {
		class: className = '',
		elevated = false,
		dense = false,
		interactive = false,
		children
	}: Props = $props();

	const classes = [
		'glass-panel',
		elevated && 'glass-panel-elevated',
		dense && 'glass-panel-dense',
		interactive && 'cursor-pointer',
		className
	]
		.filter(Boolean)
		.join(' ');
</script>

<div class={classes}>
	{@render children()}
</div>

<style>
	:global(.glass-panel) {
		background: var(--color-surface-card);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2xl);
		transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
	}

	:global(.glass-panel:hover) {
		border-color: var(--color-border-hover);
		background: rgba(255, 255, 255, 0.05);
		box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5);
	}

	:global(.glass-panel-elevated) {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	:global(.glass-panel-elevated:hover) {
		border-color: rgba(255, 255, 255, 0.25);
		background: rgba(255, 255, 255, 0.08);
	}

	:global(.glass-panel-dense) {
		background: rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
</style>
