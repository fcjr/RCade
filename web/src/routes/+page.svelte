<script lang="ts">
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import HeroSection from '$lib/component/sections/HeroSection.svelte';
	import StepsGrid from '$lib/component/sections/StepsGrid.svelte';
	import SectionHeader from '$lib/component/common/SectionHeader.svelte';
	import FeaturedGameCard from '$lib/component/FeaturedGameCard.svelte';
	import StepCard from '$lib/component/StepCard.svelte';
	import CodeSnippet from '$lib/component/CodeSnippet.svelte';
	import Footer from '$lib/component/Footer.svelte';

	let isLoggedIn = $state(page.data.session != null);

	function handlePlayGame(gameId: string) {
		console.log('Playing game:', gameId);
	}
</script>

<div class="app">
	<div class="ambient-glow"></div>
	<div class="grid-pattern"></div>

	<HeroSection
		badge="Beta"
		subtitle="The open-source arcade platform. Write your game in any language, push to GitHub, and play on real hardware instantly."
	>
		{#snippet title()}
			Build.<br />
			Deploy.<br />
			<span class="gradient-text">Play.</span>
		{/snippet}
		<div class="code-wrapper">
			<CodeSnippet />
		</div>
		<a class="secondary-action" href="/games">
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
				><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"
				></polyline></svg
			>
		</a>

		<!-- {#snippet visual()}
			<FeaturedGameCard
				title="miRCo Engine"
				authors={['Claire Froelich', 'Jack Ratner', 'Jonathan Rippy', 'Greg Sadetsky']}
				backgroundImage="/micro.png"
				badge="MOST LOVED"
				onPlay={() => handlePlayGame('micro-engine')}
			/>
		{/snippet} -->
	</HeroSection>

	<div class="container section">
		<SectionHeader subtitle="From localhost to leaderboards in minutes.">
			{#snippet title()}
				Deploy in <span class="highlight">3 Steps</span>
			{/snippet}
		</SectionHeader>

		<StepsGrid>
			<div class="step-wrapper" in:fly={{ y: 20, duration: 500, delay: 500 }}>
				<StepCard
					number={1}
					title="Build your game"
					description="Supports any language that exports to web — Svelte, React, Rust, Unity, Godot."
					codeSnippet="npm create rcade@latest"
				/>
			</div>
			<div class="step-wrapper" in:fly={{ y: 20, duration: 500, delay: 600 }}>
				<StepCard
					number={2}
					title="Push to GitHub"
					description="Connect your repository. Every git push triggers a build and deploys automatically."
					codeSnippet="git push -u origin main"
				/>
			</div>
			<div class="step-wrapper" in:fly={{ y: 20, duration: 500, delay: 700 }}>
				<StepCard
					number={3}
					title="Play on hardware"
					description="Your game goes live on the cabinet and the web. Share it, play it, and have fun!"
					badge="Live in ~30s"
				/>
			</div>
		</StepsGrid>
	</div>
</div>

<style>
	.app {
		min-height: 100vh;
		position: relative;
	}

	/* --- Background Effects --- */
	.ambient-glow {
		position: fixed;
		top: -10%;
		right: -10%;
		width: 800px;
		height: 800px;
		background: radial-gradient(circle, rgba(250, 204, 21, 0.06) 0%, transparent 70%);
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

	/* Gradient text helper */
	.gradient-text {
		background: linear-gradient(135deg, #facc15, #f59e0b);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	/* Actions & CTA Styling */
	.code-wrapper {
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
	}

	.secondary-action {
		padding: 0 2rem;
		font-size: 1rem;
		font-weight: 700;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
		background: rgba(255, 255, 255, 0.05);
		color: #f5f5f5;
		border: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-family: var(--font-body);
		text-decoration: none;
	}

	.secondary-action:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
	}

	.step-wrapper {
		height: 100%;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.secondary-action {
			width: 100%;
			justify-content: center;
		}
	}
</style>
