<script lang="ts">
	import { page } from '$app/state';
	import { fade, scale } from 'svelte/transition';
	import { signIn } from '@auth/sveltekit/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Use session user or null
	let user = page.data.session?.user;

	// Fallback app data for preview purposes if not loaded from server yet
	let app = data.app || {
		name: 'Unknown Application',
		description: 'This application is requesting access to your account details.',
		url: '#'
	};

	let isSubmitting = $state(false);

	let initials = $derived(
		user?.name
			? user.name
					.split(' ')
					.map((n: string) => n[0])
					.join('')
					.toUpperCase()
					.slice(0, 2)
			: '??'
	);

	async function handleAuthorize() {
		isSubmitting = true;
		// TODO: specific logic to grant token/code
		// await fetch('/api/oauth/authorize', { method: 'POST' ... })
	}

	async function handleSignIn() {
		isSubmitting = true;
		await signIn('recurse');
	}

	function handleCancel() {
		window.history.back();
	}
</script>

<div class="auth-page">
	<div class="ambient-glow"></div>

	<main class="auth-container">
		<div class="auth-card" in:scale={{ start: 0.95, duration: 300 }}>
			<!-- App Identity Header -->
			<div class="app-header">
				<div class="app-icon">
					{app.name[0].toUpperCase()}
				</div>
				<h1>{app.name}</h1>
				{#if app.url && app.url !== '#'}
					<a href={app.url} target="_blank" class="app-url">{new URL(app.url).hostname}</a>
				{/if}
			</div>

			<div class="divider"></div>

			<div class="content-body">
				{#if user}
					<!-- AUTHENTICATED STATE: CONSENT SCREEN -->
					<h2 class="request-title">Wants to access your account</h2>
					<p class="description">
						{app.description ||
							'This app would like to verify your identity and access your public profile information.'}
					</p>

					<!-- User Context -->
					<div class="user-context">
						<div class="user-avatar">
							{#if user.image}
								<img src={user.image} alt={user.name} />
							{:else}
								<div class="avatar-placeholder">{initials}</div>
							{/if}
						</div>
						<div class="user-info">
							<span class="label">Signed in as</span>
							<span class="value">{user.email}</span>
						</div>
					</div>
				{:else}
					<!-- UNAUTHENTICATED STATE: SIGN IN PROMPT -->
					<h2 class="request-title">Sign in to continue</h2>
					<p class="description">
						You need to sign in to grant <strong>{app.name}</strong> access to your account.
					</p>

					<div class="signin-placeholder">
						<div class="icon-circle">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
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
						</div>
						<p>Authentication required</p>
					</div>
				{/if}
			</div>

			<div class="divider"></div>

			<div class="actions">
				<button class="btn-cancel" onclick={handleCancel} disabled={isSubmitting}> Cancel </button>
				{#if user}
					<button class="btn-authorize" onclick={handleAuthorize} disabled={isSubmitting}>
						{#if isSubmitting}
							<div class="spinner"></div>
							Authorizing...
						{:else}
							Authorize
						{/if}
					</button>
				{:else}
					<button class="btn-authorize" onclick={handleSignIn} disabled={isSubmitting}>
						{#if isSubmitting}
							<div class="spinner"></div>
							Signing in...
						{:else}
							Sign In
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</main>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');

	:global(body) {
		margin: 0;
		padding: 0;
		font-family: 'DM Sans', sans-serif;
		background: #050505;
		color: #f5f5f5;
	}

	.auth-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
	}

	.ambient-glow {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 800px;
		height: 800px;
		background: radial-gradient(
			circle at center,
			rgba(250, 204, 21, 0.08) 0%,
			rgba(250, 204, 21, 0.02) 40%,
			transparent 70%
		);
		pointer-events: none;
		z-index: 0;
		filter: blur(60px);
	}

	.auth-container {
		position: relative;
		z-index: 2;
		width: 100%;
		max-width: 420px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.auth-card {
		background: rgba(20, 20, 20, 0.8);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
	}

	/* --- Header --- */
	.app-header {
		padding: 2.5rem 2rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		background: linear-gradient(to bottom, rgba(255, 255, 255, 0.02), transparent);
	}

	.app-icon {
		width: 64px;
		height: 64px;
		background: linear-gradient(135deg, #facc15, #ca8a04);
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Syne', sans-serif;
		font-size: 2rem;
		font-weight: 800;
		color: #000;
		margin-bottom: 1.25rem;
		box-shadow: 0 10px 20px rgba(250, 204, 21, 0.2);
	}

	.app-header h1 {
		font-family: 'Syne', sans-serif;
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
		color: #fff;
	}

	.app-url {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.4);
		text-decoration: none;
		transition: color 0.2s;
	}
	.app-url:hover {
		color: #facc15;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
		width: 100%;
	}

	/* --- Body --- */
	.content-body {
		padding: 2rem;
		min-height: 240px; /* Prevent height jump between states */
		display: flex;
		flex-direction: column;
	}

	.request-title {
		font-size: 1.1rem;
		font-weight: 600;
		text-align: center;
		margin: 0 0 0.75rem;
		color: #fff;
	}

	.description {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
		margin: 0 0 2rem;
		line-height: 1.5;
	}

	.description strong {
		color: #facc15;
		font-weight: 600;
	}

	/* User Context */
	.user-context {
		display: flex;
		align-items: center;
		gap: 1rem;
		background: rgba(255, 255, 255, 0.03);
		padding: 0.75rem 1rem;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.05);
		margin-bottom: 2rem;
	}

	.user-avatar img {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: #2a2a2a;
		color: #facc15;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.9rem;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		overflow: hidden;
	}

	.user-info .label {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.4);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.user-info .value {
		font-size: 0.9rem;
		color: #fff;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Sign In Placeholder */
	.signin-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: auto;
		margin-bottom: auto;
		color: rgba(255, 255, 255, 0.4);
	}
	.icon-circle {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.05);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.6);
	}
	.signin-placeholder p {
		margin: 0;
		font-size: 0.85rem;
	}

	/* Permissions */
	.permissions-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.permissions-list li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.9rem;
	}

	.permissions-list svg {
		color: #4ade80;
		flex-shrink: 0;
	}

	/* --- Actions --- */
	.actions {
		padding: 1.5rem 2rem;
		display: flex;
		gap: 1rem;
		background: rgba(0, 0, 0, 0.2);
	}

	button {
		flex: 1;
		padding: 0.875rem;
		border-radius: 8px;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		font-family: 'DM Sans', sans-serif;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.6);
	}
	.btn-cancel:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.05);
		color: #fff;
	}

	.btn-authorize {
		background: #facc15;
		border: none;
		color: #000;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
	.btn-authorize:hover:not(:disabled) {
		background: #fbbf24;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(250, 204, 21, 0.3);
	}
	.btn-authorize:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.secure-footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.8rem;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(0, 0, 0, 0.1);
		border-top-color: #000;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
