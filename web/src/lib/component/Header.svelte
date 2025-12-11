<script lang="ts">
	import { page } from '$app/state';
	import { signIn } from '@auth/sveltekit/client';
	import StatusBar from './StatusBar.svelte';
</script>

<header class="header">
	<!-- <StatusBar currentGame={'Snake Evolved'} /> -->
	<div class="container">
		<div class="logo-wrapper">
			<a class="logo-text" href="/">
				<span class="dot">@</span>RCade
			</a>
		</div>

		<nav class="nav">
			{#if page.data.session?.user}
				<!-- <a class="nav-link" href="/my-games">My Games</a>
				<div class="separator"></div> -->

				<a class="profile-trigger" href="/profile" aria-label="Go to profile">
					<div class="avatar-container">
						{#if page.data.session.user.image}
							<img
								src={page.data.session.user.image}
								alt={page.data.session.user.name}
								class="avatar-img"
							/>
						{:else}
							{page.data.session.user.name?.charAt(0).toUpperCase()}
						{/if}
					</div>
					<div class="profile-meta">
						<span class="username">{page.data.session.user.name}</span>
						<span class="user-role">Profile</span>
					</div>
				</a>
			{:else}
				<button class="cta-button" onclick={() => signIn('recurse')}>
					<span class="icon">
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
							><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline
								points="10 17 15 12 10 7"
							/><line x1="15" y1="12" x2="3" y2="12" /></svg
						>
					</span>
					Sign in with RC
				</button>
			{/if}
		</nav>
	</div>

	<div class="border-glow"></div>
</header>

<style>
	/* --- Layout & Glass --- */
	.header {
		position: sticky;
		top: 0;
		z-index: 100;
		background: rgba(5, 5, 5, 0.85); /* Slightly darker for contrast */
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.container {
		max-width: 1300px;
		margin: 0 auto;
		padding: 0.75rem 2rem; /* Slimmer vertical padding */
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	/* --- Brand --- */
	.logo-text {
		font-family: 'Jersey 10', sans-serif;
		font-size: 3rem;
		font-weight: 400;
		color: #f5f5f5;
		text-decoration: none;
		letter-spacing: 0.03em;
		display: flex;
		align-items: center;
		line-height: 0.6;
	}

	.dot {
		color: #facc15;
	}

	/* --- Nav --- */
	.nav {
		display: flex;
		gap: 2rem;
		align-items: center;
	}

	/* --- Profile Trigger --- */
	.profile-trigger {
		display: flex;
		flex-direction: row-reverse;
		align-items: center;
		gap: 12px;
		text-decoration: none;
		cursor: pointer;
		/* group: hover;  (Note: pure CSS doesn't use 'group' syntax like Tailwind, handled via parent hover selectors below) */
	}

	.avatar-container {
		position: relative;
		width: 38px;
		height: 38px;
		background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px; /* Squircle instead of circle */
		display: flex;
		align-items: center;
		justify-content: center;
		color: #f5f5f5;
		font-weight: 700;
		font-family: 'Syne', sans-serif;
		font-size: 1rem;
		transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
		overflow: hidden; /* Ensures image clips to rounded corners */
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* Hover: Avatar glows yellow */
	.profile-trigger:hover .avatar-container {
		border-color: #facc15;
		background: rgba(250, 204, 21, 0.1);
		color: #facc15;
		box-shadow: 0 0 15px rgba(250, 204, 21, 0.2);
	}

	.profile-meta {
		display: flex;
		flex-direction: column;
		align-items: end;
		line-height: 1.2;
	}

	.username {
		color: #f5f5f5;
		font-size: 0.9rem;
		font-weight: 600;
		font-family: 'DM Sans', sans-serif;
		transition: color 0.2s;
	}

	.user-role {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.75rem;
		font-weight: 500;
		font-family: 'JetBrains Mono', monospace;
	}

	.profile-trigger:hover .username {
		color: #facc15;
	}

	/* --- CTA --- */
	.cta-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: #facc15;
		color: #0a0a0a;
		border: none;
		padding: 0.6rem 1.25rem;
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.95rem;
		cursor: pointer;
		font-family: 'DM Sans', sans-serif;
		transition: all 0.2s;
	}

	.cta-button:hover {
		background: #f59e0b;
		transform: translateY(-1px);
	}

	/* --- Mobile --- */
	@media (max-width: 640px) {
		.profile-meta {
			display: none; /* Hide text on mobile */
		}

		.nav {
			gap: 1rem;
		}
	}
</style>
