<script lang="ts">
	import { fly } from 'svelte/transition';
	import Badge from '../common/Badge.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		badge?: string;
		title: Snippet;
		subtitle?: string;
		children: Snippet;
		visual?: Snippet;
	}

	let { badge, title, subtitle, children, visual }: Props = $props();
</script>

<section class="hero-section">
	<div class="container grid-2col">
		<div class="hero-content" in:fly={{ y: 20, duration: 600, delay: 0 }}>
			{#if badge}
				<div class="badge-pill">
					<span class="pulse-dot"></span>
					<span>{badge}</span>
				</div>
			{/if}

			<h1>{@render title()}</h1>

			{#if subtitle}
				<p class="hero-subtitle">{subtitle}</p>
			{/if}

			<div class="actions">
				{@render children()}
			</div>
		</div>

		{#if visual}
			<div class="hero-visual" in:fly={{ y: 40, duration: 800, delay: 200 }}>
				<div class="glow-backdrop"></div>
				{@render visual()}
			</div>
		{/if}
	</div>
</section>

<style>
	.hero-section {
		padding: var(--spacing-4xl) 0 var(--spacing-3xl);
		position: relative;
	}

	.grid-2col {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: var(--spacing-4xl);
		align-items: center;
	}

	.hero-content h1 {
		font-family: var(--font-title);
		font-size: clamp(3.5rem, 6vw, 7.5rem);
		font-weight: 400;
		margin: 0 0 1.5rem;
		line-height: 0.65;
		letter-spacing: -0.02em;
		color: #fff;
	}

	.badge-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 100px;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-primary);
		margin-bottom: 2rem;
		backdrop-filter: blur(5px);
	}

	.pulse-dot {
		width: 8px;
		height: 8px;
		background: var(--color-primary);
		border-radius: 50%;
		box-shadow: 0 0 10px var(--color-primary);
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
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

	.hero-subtitle {
		font-size: 1.25rem;
		color: rgba(255, 255, 255, 0.6);
		margin: 0 0 3rem;
		line-height: 1.6;
		max-width: 500px;
	}

	.actions {
		display: flex;
		align-items: stretch;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.hero-visual {
		position: relative;
		perspective: 1000px;
	}

	.glow-backdrop {
		position: absolute;
		inset: -20px;
		background: radial-gradient(circle, rgba(250, 204, 21, 0.15), transparent 70%);
		filter: blur(40px);
		z-index: -1;
	}

	@media (max-width: 1024px) {
		.hero-section {
			padding: var(--spacing-3xl) 0 var(--spacing-2xl);
		}

		.grid-2col {
			grid-template-columns: 1fr;
			gap: var(--spacing-2xl);
		}

		.hero-content {
			text-align: center;
		}

		.hero-subtitle {
			margin: 0 auto 3rem;
		}

		.badge-pill {
			margin: 0 auto 2rem;
		}

		.actions {
			justify-content: center;
		}

		.hero-visual {
			max-width: 500px;
			margin: 0 auto;
		}
	}

	@media (max-width: 640px) {
		.hero-content h1 {
			font-size: 3rem;
		}

		.actions {
			width: 100%;
		}
	}
</style>
