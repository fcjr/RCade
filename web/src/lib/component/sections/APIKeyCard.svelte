<script lang="ts">
	import { fade } from 'svelte/transition';
	import Card from '../common/Card.svelte';
	import CopyableField from '../common/CopyableField.svelte';

	interface AppKey {
		id: string;
		appId: string;
		rc_id: string;
		key: string;
		lastUsedAt: Date | null;
		createdAt: Date;
		app: {
			id: string;
			name: string;
			description: string | null;
			owner_rc_id: string;
		};
	}

	interface Props {
		appKey: AppKey;
		isDeleting?: boolean;
		onDelete?: (keyId: string) => void;
	}

	let { appKey, isDeleting = false, onDelete }: Props = $props();

	function formatDate(date: Date | undefined | null) {
		if (date == undefined) return 'Never';
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const headerSnippet = {
		render: () => ``
	};

	const footerSnippet = {
		render: () => ``
	};
</script>

<Card class="key-card">
	{#snippet header()}
		<div class="app-identity">
			<div class="status-dot"></div>
			<h3>{appKey.app.name}</h3>
		</div>
		<button
			class="btn-icon delete"
			onclick={() => onDelete?.(appKey.id)}
			title="Revoke Key"
			disabled={isDeleting}
		>
			{#if isDeleting}
				<div class="spinner tiny"></div>
			{:else}
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
					><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path
						d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
					></path></svg
				>
			{/if}
		</button>
	{/snippet}

	{#snippet footer()}
		<div class="meta-item">
			<span class="label">Created</span>
			<span class="value">{formatDate(appKey.createdAt)}</span>
		</div>
		<div class="meta-item">
			<span class="label">Last Used</span>
			<span class="value">{formatDate(appKey.lastUsedAt)}</span>
		</div>
	{/snippet}

	{#if isDeleting}
		<div class="card-loading-overlay" transition:fade></div>
	{/if}

	<CopyableField value={appKey.key} label="Secret Key" />
</Card>

<style>
	.app-identity {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.app-identity h3 {
		margin: 0;
		font-family: var(--font-heading);
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text-primary);
	}

	.status-dot {
		width: 8px;
		height: 8px;
		background: #4ade80;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.btn-icon {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.6);
		border-radius: var(--radius-md);
		padding: 0.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.btn-icon:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.btn-icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.card-loading-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-2xl);
		z-index: 10;
	}

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.spinner.tiny {
		width: 12px;
		height: 12px;
		border-width: 1.5px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.meta-item .label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.meta-item .value {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}
</style>
