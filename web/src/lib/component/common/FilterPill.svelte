<script lang="ts">
	interface Props {
		active?: boolean;
		disabled?: boolean;
		class?: string;
		onclick?: (e: MouseEvent) => void;
		children: any;
	}

	let {
		active = false,
		disabled = false,
		class: className = '',
		onclick,
		children
	}: Props = $props();
</script>

<button
	class={`filter-pill ${active ? 'active' : ''} ${disabled ? 'disabled' : ''} ${className}`}
	{disabled}
	{onclick}
>
	{@render children()}
</button>

<style>
	.filter-pill {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.5);
		padding: 0.5rem 1.25rem;
		border-radius: var(--radius-md);
		font-family: var(--font-tech);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		display: inline-block;
	}

	.filter-pill:hover:not(.disabled) {
		background: rgba(250, 204, 21, 0.1);
		color: var(--color-primary);
		border-color: rgba(250, 204, 21, 0.3);
	}

	.filter-pill.active {
		background: var(--color-primary);
		color: #000;
		border-color: var(--color-primary);
	}

	.filter-pill.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
