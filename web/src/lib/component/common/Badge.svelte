<script lang="ts">
	interface Props {
		variant?: 'default' | 'primary' | 'success' | 'error';
		withDot?: boolean;
		class?: string;
		children: any;
	}

	let { variant = 'default', withDot = false, class: className = '' }: Props = $props();

	const variantMap = {
		default: 'badge',
		primary: 'badge badge-primary',
		success: 'badge badge-success',
		error: 'badge badge-error'
	};

	const classes = [variantMap[variant], withDot && 'badge-with-dot', className]
		.filter(Boolean)
		.join(' ');
</script>

<span class={classes}>
	{#if withDot}
		<span class="badge-dot"></span>
	{/if}
	<slot></slot>
</span>

<style>
	:global(.badge) {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-full);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
		white-space: nowrap;
	}

	:global(.badge-primary) {
		background: rgba(250, 204, 21, 0.15);
		border-color: rgba(250, 204, 21, 0.3);
		color: var(--color-primary);
	}

	:global(.badge-success) {
		background: rgba(74, 222, 128, 0.15);
		border-color: rgba(74, 222, 128, 0.3);
		color: var(--color-success);
	}

	:global(.badge-error) {
		background: var(--color-error-light);
		border-color: var(--color-error-border);
		color: var(--color-error);
	}

	:global(.badge-with-dot) {
		padding-left: var(--spacing-sm);
	}

	:global(.badge-dot) {
		width: 6px;
		height: 6px;
		background: currentColor;
		border-radius: 50%;
		flex-shrink: 0;
		animation: pulse-dot 2s infinite;
	}

	@keyframes pulse-dot {
		0% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(0.8);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
