<script lang="ts">
	import { fade, scale } from 'svelte/transition';

	let { code = 'npm create rcade@latest', onCopy = null } = $props();

	let copied = $state(false);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			if (onCopy) onCopy();

			// Reset after 2 seconds
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy!', err);
		}
	}
</script>

<button
	class="snippet-shell"
	class:success={copied}
	onclick={handleCopy}
	aria-label="Copy command to clipboard"
>
	<div class="code-content">
		<span class="prompt">$</span>
		<code>{code}</code>
	</div>

	<div class="icon-wrapper">
		{#if copied}
			<div class="icon-state" in:scale={{ duration: 200, start: 0.5 }} out:fade={{ duration: 100 }}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="check"
				>
					<polyline points="20 6 9 17 4 12"></polyline>
				</svg>
			</div>
		{:else}
			<div class="icon-state" in:scale={{ duration: 200, start: 0.5 }} out:fade={{ duration: 100 }}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="clipboard"
				>
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
				</svg>
			</div>
		{/if}
	</div>

	<div class="glow-effect"></div>
</button>

<style>
	.snippet-shell {
		position: relative;
		appearance: none;
		border: none;
		background: #141414; /* Slightly lighter than main bg */
		padding: 0;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		cursor: pointer;
		overflow: hidden;
		transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);

		/* The Border Implementation */
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.1),
			0 4px 12px rgba(0, 0, 0, 0.3);

		/* Max width logic if used in a flexible container */
		min-width: 300px;
		max-width: 100%;
	}

	/* Hover State */
	.snippet-shell:hover {
		transform: translateY(-2px);
		background: #1a1a1a;
		box-shadow:
			0 0 0 1px rgba(250, 204, 21, 0.4),
			/* Yellow border hint */ 0 8px 24px rgba(0, 0, 0, 0.5);
	}

	/* Active/Press State */
	.snippet-shell:active {
		transform: translateY(0) scale(0.99);
	}

	/* Success State (Copied) */
	.snippet-shell.success {
		background: rgba(74, 222, 128, 0.05);
		box-shadow:
			0 0 0 1px rgba(74, 222, 128, 0.5),
			/* Green border */ 0 8px 24px rgba(74, 222, 128, 0.1);
	}

	.code-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 1rem;
		text-align: left;
	}

	.prompt {
		color: #facc15; /* Yellow Accent */
		font-weight: 700;
		user-select: none;
	}

	code {
		color: #f5f5f5;
		font-weight: 500;
		letter-spacing: -0.02em;
	}

	/* --- Icon Handling --- */
	.icon-wrapper {
		position: relative;
		width: 24px;
		height: 24px;
		margin-left: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-state {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.clipboard {
		color: rgba(255, 255, 255, 0.4);
		transition: color 0.2s;
	}

	.snippet-shell:hover .clipboard {
		color: #f5f5f5;
	}

	.check {
		color: #4ade80; /* Green Success */
	}

	/* Mobile responsiveness */
	@media (max-width: 640px) {
		.snippet-shell {
			min-width: 100%;
			font-size: 0.9rem;
			padding: 0.875rem 1rem;
		}

		.code-content {
			font-size: 0.9rem;
		}
	}
</style>
