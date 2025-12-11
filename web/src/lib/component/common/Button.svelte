<script lang="ts">
	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		class?: string;
		onclick?: (e: MouseEvent) => void;
		type?: 'button' | 'submit' | 'reset';
		children: any;
	}

	let {
		variant = 'primary',
		size = 'md',
		disabled = false,
		class: className = '',
		type = 'button',
		children,
		onclick
	}: Props = $props();

	const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : 'btn-md';
	const variantClass = `btn-${variant}`;
	const classes = [sizeClass, variantClass, disabled && 'btn-disabled', className]
		.filter(Boolean)
		.join(' ');
</script>

<button {type} class={`btn ${classes}`} {disabled} {onclick}>
	{@render children()}
</button>

<style>
	.btn {
		border-radius: var(--radius-xl);
		border: none;
		font-family: var(--font-body);
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
		cursor: pointer;
	}

	/* Sizes */
	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-md);
		font-size: 0.875rem;
	}

	.btn-md {
		padding: var(--spacing-sm) var(--spacing-lg);
		font-size: 1rem;
	}

	.btn-lg {
		padding: var(--spacing-md) var(--spacing-xl);
		font-size: 1.125rem;
	}

	/* Variants */
	.btn-primary {
		background: var(--color-primary);
		color: #000;
	}

	.btn-primary:not(:disabled):hover {
		background: var(--color-primary-dark);
		transform: translateY(-2px);
	}

	.btn-secondary {
		background: var(--color-surface-card);
		border: 1px solid var(--color-border);
		color: var(--color-text-primary);
	}

	.btn-secondary:not(:disabled):hover {
		background: var(--color-surface-elevated);
		border-color: var(--color-border-hover);
		transform: translateY(-2px);
	}

	.btn-ghost {
		background: transparent;
		border: 1px solid transparent;
		color: var(--color-text-primary);
	}

	.btn-ghost:not(:disabled):hover {
		background: var(--color-surface-card);
		border-color: var(--color-border);
		transform: translateY(-2px);
	}

	/* Disabled state */
	.btn-disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn:not(.btn-disabled):active {
		transform: translateY(0);
	}
</style>
