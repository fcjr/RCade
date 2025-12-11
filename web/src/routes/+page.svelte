<script lang="ts">
	import StatusBar from '$lib/component/StatusBar.svelte';
	import Header from '$lib/component/Header.svelte';
	import FeaturedGameCard from '$lib/component/FeaturedGameCard.svelte';
	import StepCard from '$lib/component/StepCard.svelte';
	import Footer from '$lib/component/Footer.svelte';
	import CodeSnippet from '$lib/component/CodeSnippet.svelte';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';

	// Mock data
	let isLoggedIn = $state(page.data.session != null);

	function handlePlayGame(gameId: string) {
		console.log('Playing game:', gameId);
	}
</script>

<div class="app">
	<div class="ambient-glow"></div>
	<div class="grid-pattern"></div>

	<div class="container">
		<section class="hero">
			<div class="hero-content" in:fly={{ y: 20, duration: 600, delay: 0 }}>
				<div class="badge-pill">
					<span class="pulse-dot"></span>
					<span>Beta</span>
				</div>

				<h1>
					Build.<br />
					Deploy.<br />
					<span class="gradient-text">Play.</span>
				</h1>

				<p class="hero-subtitle">
					The open-source arcade platform. Write your game in any language, push to GitHub, and play
					on real hardware instantly.
				</p>

				<div class="actions">
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
				</div>
			</div>

			<div class="hero-visual" in:fly={{ y: 40, duration: 800, delay: 200 }}>
				<div class="card-glow-backdrop"></div>
				<FeaturedGameCard
					title="miRCo Engine"
					authors={['Claire Froelich', 'Jack Ratner', 'Jonathan Rippy', 'Greg Sadetsky']}
					backgroundImage="/micro.png"
					badge="MOST LOVED"
					onPlay={() => handlePlayGame('micro-engine')}
				/>
			</div>
		</section>

		<section class="how-it-works">
			<div class="section-header" in:fade={{ duration: 600, delay: 400 }}>
				<h2>Deploy in <span class="highlight">3 Steps</span></h2>
				<p>From localhost to leaderboards in minutes.</p>
			</div>

			<div class="steps-grid">
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
			</div>
		</section>
	</div>
</div>

<style>
	.app {
		min-height: 100vh;
		position: relative;
	}

	.container {
		max-width: 1300px;
		margin: 0 auto;
		padding: 0 2rem;
		position: relative;
		z-index: 2;
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

	/* --- Hero --- */
	.hero {
		padding: 6rem 0 8rem;
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 6rem;
		align-items: center;
	}

	/* Badge Pill */
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
		color: #facc15;
		margin-bottom: 2rem;
		backdrop-filter: blur(5px);
	}

	.pulse-dot {
		width: 8px;
		height: 8px;
		background: #facc15;
		border-radius: 50%;
		box-shadow: 0 0 10px #facc15;
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

	.hero-content h1 {
		font-family: 'Jersey 15', sans-serif;
		font-size: clamp(3.5rem, 6vw, 5.5rem);
		font-weight: 400;
		margin: 0 0 1.5rem;
		line-height: 0.6;
		letter-spacing: -0.02em;
		font-size: 8rem;
		color: #fff;
	}

	.gradient-text {
		background: linear-gradient(135deg, #facc15, #f59e0b);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.hero-subtitle {
		font-size: 1.25rem;
		color: rgba(255, 255, 255, 0.6);
		margin: 0 0 3rem;
		line-height: 1.6;
		max-width: 500px;
	}

	/* Actions */
	.actions {
		display: flex;
		align-items: stretch;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

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
		font-family: 'DM Sans', sans-serif;
	}

	.secondary-action:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
	}

	/* Hero Visual (Card) */
	.hero-visual {
		position: relative;
		perspective: 1000px;
	}

	.card-glow-backdrop {
		position: absolute;
		inset: -20px;
		background: radial-gradient(circle, rgba(250, 204, 21, 0.15), transparent 70%);
		filter: blur(40px);
		z-index: -1;
	}

	/* --- How It Works --- */
	.how-it-works {
		padding: 6rem 0;
	}

	.section-header {
		text-align: center;
		margin-bottom: 4rem;
	}

	.section-header h2 {
		font-family: 'Syne', sans-serif;
		font-size: 2.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}

	.section-header .highlight {
		color: #facc15;
		position: relative;
		display: inline-block;
	}

	.section-header p {
		color: rgba(255, 255, 255, 0.5);
		font-size: 1.1rem;
	}

	.steps-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 2rem;
	}

	/* We wrap StepCard to give it the glass treatment if the component itself doesn't have it */
	.step-wrapper {
		height: 100%;
	}

	/* Apply styles to whatever StepCard renders (assuming standard markup) */
	/* Note: In a real scenario, you'd style StepCard.svelte directly, but here we style the context */
	:global(.step-card) {
		background: rgba(255, 255, 255, 0.03) !important;
		border: 1px solid rgba(255, 255, 255, 0.08) !important;
		backdrop-filter: blur(10px);
		border-radius: 16px;
		transition: transform 0.3s ease !important;
	}

	:global(.step-card:hover) {
		transform: translateY(-5px);
		border-color: rgba(255, 255, 255, 0.2) !important;
	}

	/* --- Responsive --- */
	@media (max-width: 1024px) {
		.hero {
			grid-template-columns: 1fr;
			text-align: center;
			gap: 4rem;
			padding-top: 4rem;
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
		.container {
			padding: 1.5rem;
		}

		.hero-content h1 {
			font-size: 3rem;
		}

		.secondary-action {
			width: 100%;
			justify-content: center;
		}
	}
</style>
