<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="error-page">
	<div class="ambient-glow"></div>
	<div class="grid-pattern"></div>

	<div class="error-content">
		<div class="error-code">{page.status}</div>
		<h1 class="error-title">
			{#if page.status === 404}
				Game Not Found
			{:else}
				Something Went Wrong
			{/if}
		</h1>
		<p class="error-message">
			{#if page.status === 404}
				The game you're looking for doesn't exist or has been removed.
			{:else if page.error?.message}
				{page.error.message}
			{:else}
				An unexpected error occurred.
			{/if}
		</p>

		<div class="error-actions">
			<a href="/games" class="primary-action">
				<span>Browse Games</span>
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
					<rect x="2" y="6" width="20" height="12" rx="2"></rect>
					<path d="M6 12h4"></path>
					<path d="M8 10v4"></path>
					<circle cx="17" cy="10" r="1"></circle>
					<circle cx="15" cy="12" r="1"></circle>
				</svg>
			</a>
			<a href="/" class="secondary-action">
				<span>Go Home</span>
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
					<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
					<polyline points="9 22 9 12 15 12 15 22"></polyline>
				</svg>
			</a>
		</div>

		<div class="insert-coin">INSERT COIN TO CONTINUE</div>
	</div>
</div>

<style>
	.error-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		padding: var(--spacing-xl);
	}

	.ambient-glow {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 600px;
		height: 600px;
		background: radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, transparent 70%);
		filter: blur(80px);
		z-index: 0;
		pointer-events: none;
	}

	.grid-pattern {
		position: fixed;
		inset: 0;
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
		background-size: 50px 50px;
		mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
		z-index: 0;
		pointer-events: none;
	}

	.error-content {
		position: relative;
		z-index: 1;
		text-align: center;
		max-width: 500px;
	}

	.error-code {
		font-family: var(--font-title);
		font-size: clamp(8rem, 20vw, 12rem);
		line-height: 1;
		background: linear-gradient(135deg, #ef4444, #dc2626);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		text-shadow: 0 0 60px rgba(239, 68, 68, 0.3);
		margin-bottom: var(--spacing-md);
	}

	.error-title {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 5vw, 2.5rem);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		margin: 0 0 var(--spacing-md);
	}

	.error-message {
		font-family: var(--font-body);
		font-size: 1.125rem;
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-2xl);
		line-height: 1.6;
	}

	.error-actions {
		display: flex;
		gap: var(--spacing-md);
		justify-content: center;
		flex-wrap: wrap;
		margin-bottom: var(--spacing-3xl);
	}

	.primary-action,
	.secondary-action {
		padding: 0.875rem 1.5rem;
		font-size: 0.95rem;
		font-weight: var(--font-weight-bold);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all var(--transition-base);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-family: var(--font-body);
		text-decoration: none;
	}

	.primary-action {
		background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
		color: #000;
		border: none;
	}

	.primary-action:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(250, 204, 21, 0.3);
	}

	.secondary-action {
		background: rgba(255, 255, 255, 0.05);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.secondary-action:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
	}

	.insert-coin {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-text-muted);
		letter-spacing: 0.2em;
		animation: blink 1.5s step-end infinite;
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}

	@media (max-width: 640px) {
		.error-actions {
			flex-direction: column;
		}

		.primary-action,
		.secondary-action {
			width: 100%;
			justify-content: center;
		}
	}
</style>
