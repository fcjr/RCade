<script lang="ts">
	import { fade, scale } from 'svelte/transition';

	interface Props {
		value: string;
		label?: string;
		class?: string;
	}

	let { value, label, class: className = '' }: Props = $props();

	let copied = $state(false);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy!', err);
		}
	}
</script>

<div class={`copyable-field ${className}`}>
	{#if label}
		<div class="field-label">{label}</div>
	{/if}

	<div class="field-box">
		<code>{value}</code>
		<button
			class={`copy-btn ${copied ? 'copied' : ''}`}
			onclick={handleCopy}
			title="Copy to clipboard"
		>
			{#if copied}
				<div
					class="icon-state"
					in:scale={{ duration: 200, start: 0.5 }}
					out:fade={{ duration: 100 }}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
				</div>
			{:else}
				<div
					class="icon-state"
					in:scale={{ duration: 200, start: 0.5 }}
					out:fade={{ duration: 100 }}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
					</svg>
				</div>
			{/if}
		</button>
	</div>
</div>

<style>
	.copyable-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.field-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.field-box {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.7);
		word-break: break-all;
	}

	code {
		flex: 1;
		color: inherit;
		font-family: inherit;
	}

	.copy-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.6);
		border-radius: var(--radius-md);
		padding: 0.4rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		flex-shrink: 0;
		position: relative;
	}

	.copy-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: #fff;
	}

	.copy-btn.copied {
		color: var(--color-success);
		border-color: rgba(74, 222, 128, 0.3);
	}

	.icon-state {
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
