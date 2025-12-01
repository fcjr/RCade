<script lang="ts">
	import CodeSnippet from '$lib/component/CodeSnippet.svelte';

	let {
		number = 1,
		title = 'Step Title',
		description = 'Step description',
		codeSnippet = null,
		badge = null
	} = $props();
</script>

<div class="step-card">
	<div class="step-header">
		<div class="step-marker">
			<span class="step-num">{String(number).padStart(2, '0')}</span>
		</div>
		<h3>{title}</h3>
	</div>

	<div class="step-body">
		<p>{description}</p>

		{#if codeSnippet}
			<div class="action-wrapper">
				<CodeSnippet code={codeSnippet} />
			</div>
		{/if}

		{#if badge}
			<div class="badge-wrapper">
				<div class="live-status">
					<span class="pulse-dot"></span>
					<span class="status-text">{badge}</span>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.step-card {
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: 2rem;
		height: 100%;
		display: flex;
		flex-direction: column;
		transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
		position: relative;
		overflow: hidden;
	}

	.step-card:hover {
		border-color: rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
		transform: translateY(-4px);
		box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5);
	}

	/* --- Header & Number --- */
	.step-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.step-marker {
		width: 48px;
		height: 48px;
		background: rgba(250, 204, 21, 0.1);
		border: 1px solid rgba(250, 204, 21, 0.3);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.step-num {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.1rem;
		font-weight: 700;
		color: #facc15;
	}

	h3 {
		font-family: 'Syne', sans-serif;
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		color: #f5f5f5;
		line-height: 1.1;
	}

	/* --- Body Content --- */
	.step-body {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		flex: 1; /* Pushes content to fill height if needed */
	}

	p {
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.6;
		font-size: 1rem;
		margin: 0;
	}

	/* --- Wrappers --- */
	.action-wrapper {
		margin-top: auto; /* Pushes to bottom if card has height */
	}

	.badge-wrapper {
		margin-top: auto;
		display: flex;
	}

	/* --- Live Badge --- */
	.live-status {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		background: rgba(74, 222, 128, 0.1);
		border: 1px solid rgba(74, 222, 128, 0.3);
		padding: 0.6rem 1rem;
		border-radius: 8px;
	}

	.status-text {
		color: #4ade80;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.pulse-dot {
		width: 8px;
		height: 8px;
		background: #4ade80;
		border-radius: 50%;
		box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
		animation: pulse-green 2s infinite;
	}

	@keyframes pulse-green {
		0% {
			transform: scale(0.95);
			box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
		}

		70% {
			transform: scale(1);
			box-shadow: 0 0 0 10px rgba(74, 222, 128, 0);
		}

		100% {
			transform: scale(0.95);
			box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
		}
	}
</style>
