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
	<div class="container" class:grid-layout={visual} class:centered-layout={!visual}>
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

	{#if !visual}
		<div class="ambient-glow"></div>
	{/if}
</section>

<style>
	.hero-section {
		padding: var(--spacing-4xl) 0 var(--spacing-3xl);
		position: relative;
	}

	/* --- LAYOUT VARIANTS --- */

	/* Variant 1: The standard 2-column Grid (With Visual) */
	.grid-layout {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: var(--spacing-4xl);
		align-items: center;
	}

	/* Variant 2: The Centered Layout (No Visual) */
	.centered-layout {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 900px; /* Constrain width for readability */
		margin: 0 auto;
	}

	/* Specific overrides for centered layout */
	.centered-layout .hero-content {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.centered-layout .badge-pill {
		margin-left: auto;
		margin-right: auto;
	}

	.centered-layout .actions {
		justify-content: center;
	}

	.centered-layout .hero-subtitle {
		margin-left: auto;
		margin-right: auto;
		max-width: 600px;
	}

	/* --- TYPOGRAPHY & ELEMENTS --- */

	.hero-content h1 {
		font-family: var(--font-title);
		font-size: clamp(3.5rem, 6vw, 7.5rem);
		font-weight: 400;
		margin: 0 0 1.5rem;
		line-height: 0.85; /* Increased slightly for better standalone readability */
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
		max-width: 500px; /* Default max-width */
	}

	.actions {
		display: flex;
		align-items: stretch;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	/* --- VISUALS --- */

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

	/* Ambient glow for text-only version */
	.ambient-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 60%;
		height: 60%;
		background: radial-gradient(circle, rgba(255, 255, 255, 0.03), transparent 70%);
		filter: blur(90px);
		z-index: -1;
		pointer-events: none;
	}

	/* --- RESPONSIVE --- */

	@media (max-width: 1024px) {
		.hero-section {
			padding: var(--spacing-3xl) 0 var(--spacing-2xl);
		}

		/* Collapse grid on tablet/mobile regardless of visual presence */
		.grid-layout {
			grid-template-columns: 1fr;
			gap: var(--spacing-2xl);
			text-align: center;
		}

		/* Ensure grid layout behaves like centered layout on mobile */
		.grid-layout .hero-content {
			display: flex;
			flex-direction: column;
			align-items: center;
		}

		.grid-layout .badge-pill,
		.grid-layout .hero-subtitle {
			margin-left: auto;
			margin-right: auto;
		}

		.grid-layout .actions {
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
			line-height: 1;
		}

		.actions {
			width: 100%;
			justify-content: center;
		}
	}
</style>
