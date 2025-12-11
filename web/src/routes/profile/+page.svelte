<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
	import { page } from '$app/state';
	import { slide, scale, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// --- Data Integration ---
	let user = page.data.session!.user;

	let initials = $derived(
		user
			.name!.split(' ')
			.map((n: string) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2)
	);

	// --- App Logic (Keys) ---
	type AppKey = {
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
	};

	let appKeys = $state<AppKey[]>(data.keys);

	// --- Async State Management ---
	let isGenerating = $state(false);
	let generateError = $state<string | null>(null);

	// We use a Set to track which specific IDs are currently deleting
	let deletingIds = $state(new Set<string>());

	let copiedId = $state<string | null>(null);

	// --- Helpers ---
	function copyToClipboard(text: string, id: string) {
		navigator.clipboard.writeText(text);
		copiedId = id;
		setTimeout(() => (copiedId = null), 2000);
	}

	function formatDate(date: Date | undefined | null) {
		if (date == undefined) return 'Never';

		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// --- Actions ---

	async function deleteKey(keyId: string) {
		throw new Error('Not implemented');
	}
</script>

<div class="app">
	<div class="ambient-glow"></div>

	<div class="container">
		<main>
			<section class="profile-header">
				<div class="avatar-wrapper">
					{#if user.image}
						<img src={user.image} alt={user.name} class="avatar-img" />
					{:else}
						<div class="avatar-placeholder">{initials}</div>
					{/if}

					<div class="status-indicator"></div>
				</div>

				<div class="profile-info">
					<div class="identity">
						<h1>{user.name}</h1>
					</div>

					<p class="email">{user.email}</p>

					<div class="social-links">
						{#if user.github}
							<a
								href="https://github.com/{user.github}"
								target="_blank"
								class="social-btn"
								title="GitHub"
							>
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
									><path
										d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
									></path></svg
								>
							</a>
						{/if}
						{#if user.twitter}
							<a
								href="https://twitter.com/{user.twitter}"
								target="_blank"
								class="social-btn"
								title="Twitter/X"
							>
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
									><path
										d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"
									></path></svg
								>
							</a>
						{/if}
						{#if user.linkedin}
							<a href={user.linkedin} target="_blank" class="social-btn" title="LinkedIn">
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
									><path
										d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"
									></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"
									></circle></svg
								>
							</a>
						{/if}
						{#if user.personal_site_url}
							<a href={user.personal_site_url} target="_blank" class="social-btn" title="Website">
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
									><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"
									></line><path
										d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
									></path></svg
								>
							</a>
						{/if}
					</div>
				</div>

				<button class="sign-out-btn" onclick={() => signOut()}>
					<span>Sign Out</span>
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
						><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline
							points="16 17 21 12 16 7"
						></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg
					>
				</button>
			</section>

			<section class="controls-section">
				<div class="section-header">
					<div>
						<h2>API Keys</h2>
						<p class="subtitle">Manage access tokens for your applications.</p>
						{#if generateError}
							<p class="error-msg" transition:slide>{generateError}</p>
						{/if}
					</div>
				</div>

				<div class="keys-grid">
					{#each appKeys as appKey (appKey.id)}
						<div
							class="key-card"
							in:scale={{ duration: 300, start: 0.95 }}
							out:slide={{ duration: 200 }}
							animate:flip={{ duration: 300 }}
						>
							{#if deletingIds.has(appKey.id)}
								<div class="card-loading-overlay" transition:fade></div>
							{/if}

							<div class="card-top">
								<div class="app-identity">
									<div class="status-dot"></div>
									<h3>{appKey.app.name}</h3>
								</div>
								<button
									class="btn-icon delete"
									onclick={() => deleteKey(appKey.id)}
									title="Revoke Key"
									disabled={deletingIds.has(appKey.id)}
								>
									{#if deletingIds.has(appKey.id)}
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
											><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
											></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg
										>
									{/if}
								</button>
							</div>

							<div class="key-display-wrapper">
								<div class="key-label">Secret Key</div>
								<div class="key-box">
									<code>{appKey.key}</code>
									<button
										class="btn-icon copy"
										class:copied={copiedId === appKey.id}
										onclick={() => copyToClipboard(appKey.key, appKey.id)}
										title="Copy to clipboard"
									>
										{#if copiedId === appKey.id}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg
											>
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
												><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path
													d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
												></path></svg
											>
										{/if}
									</button>
								</div>
							</div>

							<div class="card-footer">
								<div class="meta-item">
									<span class="label">Created</span>
									<span class="value">{formatDate(appKey.createdAt)}</span>
								</div>
								<div class="meta-item">
									<span class="label">Last Used</span>
									<span class="value">{formatDate(appKey.lastUsedAt)}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		</main>
	</div>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

	:global(body) {
		margin: 0;
		padding: 0;
		font-family: 'DM Sans', sans-serif;
		background: #050505;
		color: #f5f5f5;
		overflow-x: hidden;
	}

	.app {
		min-height: 100vh;
		position: relative;
		z-index: 1;
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		position: relative;
		z-index: 2;
	}

	.ambient-glow {
		position: fixed;
		top: -20%;
		left: 50%;
		transform: translateX(-50%);
		width: 1000px;
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

	/* --- Profile Header --- */
	.profile-header {
		display: flex;
		align-items: center;
		gap: 2rem;
		padding: 4rem 0 3rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 3rem;
	}

	/* Avatar */
	.avatar-wrapper {
		position: relative;
	}

	.avatar-img {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
	}

	.avatar-placeholder {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
		border: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Syne', sans-serif;
		font-size: 2.5rem;
		font-weight: 700;
		color: #facc15;
	}

	.status-indicator {
		position: absolute;
		bottom: 5px;
		right: 5px;
		width: 16px;
		height: 16px;
		background: #4ade80;
		border: 3px solid #050505;
		border-radius: 50%;
	}

	/* Profile Info */
	.profile-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1;
	}

	.identity {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.profile-info h1 {
		font-family: 'Syne', sans-serif;
		font-size: 3rem;
		line-height: 1;
		font-weight: 800;
		margin: 0;
		background: linear-gradient(to right, #ffffff, #aaaaaa);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.email {
		margin: 0;
		color: rgba(255, 255, 255, 0.6);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.95rem;
	}

	/* Social Links */
	.social-links {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.social-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.2s;
	}

	.social-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #facc15;
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
	}

	/* --- Sign Out --- */
	.sign-out-btn {
		margin-left: auto;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		padding: 0.75rem 1.25rem;
		border-radius: 8px;
		cursor: pointer;
		font-family: 'DM Sans', sans-serif;
		font-weight: 600;
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		transition: all 0.2s;
	}

	.sign-out-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	/* --- Keys Section & Generic UI --- */
	.controls-section {
		padding-bottom: 4rem;
	}
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		margin-bottom: 2.5rem;
	}
	.section-header h2 {
		font-family: 'Syne', sans-serif;
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
		color: #fff;
	}
	.subtitle {
		margin: 0;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.95rem;
	}

	.error-msg {
		color: #ef4444;
		font-size: 0.85rem;
		margin-top: 0.5rem;
		background: rgba(239, 68, 68, 0.1);
		padding: 0.5rem;
		border-radius: 4px;
		display: inline-block;
		border: 1px solid rgba(239, 68, 68, 0.2);
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: #facc15;
		color: #0a0a0a;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s;
		font-family: 'DM Sans', sans-serif;
		min-width: 160px; /* Prevent width jump during loading */
		justify-content: center;
	}
	.btn-primary:hover:not(:disabled) {
		background: #fbbf24;
		transform: translateY(-2px);
		box-shadow: 0 4px 20px rgba(250, 204, 21, 0.25);
	}
	.btn-primary:disabled {
		opacity: 0.7;
		cursor: not-allowed;
		background: #eab308;
	}

	.keys-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 1.5rem;
	}

	.key-card {
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		transition: all 0.3s;
		position: relative;
		overflow: hidden;
	}
	.key-card:hover {
		border-color: rgba(250, 204, 21, 0.3);
		transform: translateY(-4px);
		background: rgba(255, 255, 255, 0.05);
	}

	.card-loading-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 10;
		pointer-events: none;
	}

	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.app-identity {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #4ade80;
		box-shadow: 0 0 10px rgba(74, 222, 128, 0.4);
	}
	.key-card h3 {
		font-family: 'Syne', sans-serif;
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0;
		color: #fff;
	}

	.btn-icon {
		background: transparent;
		border: 1px solid transparent;
		color: rgba(255, 255, 255, 0.4);
		padding: 6px;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.btn-icon:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}
	.btn-icon.delete:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}
	.btn-icon:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}
	.btn-icon.copy.copied {
		color: #4ade80;
		background: rgba(74, 222, 128, 0.1);
	}

	.key-display-wrapper {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 10px;
		padding: 0.75rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.05);
	}
	.key-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.3);
		font-weight: 700;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}
	.key-box {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	.key-box code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
		color: #facc15;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		mask-image: linear-gradient(to right, black 85%, transparent 100%);
		width: 100%;
	}

	.card-footer {
		display: flex;
		justify-content: space-between;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}
	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.meta-item .label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.3);
	}
	.meta-item .value {
		font-size: 0.85rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
		font-variant-numeric: tabular-nums;
	}

	/* --- Loading Spinner --- */
	.spinner {
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	.spinner.small {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(0, 0, 0, 0.1);
		border-top-color: #000;
	}
	.spinner.tiny {
		width: 12px;
		height: 12px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top-color: #fff;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.profile-header {
			flex-direction: column;
			text-align: center;
			gap: 1.5rem;
		}
		.identity {
			justify-content: center;
		}
		.social-links {
			justify-content: center;
		}
		.sign-out-btn {
			margin-left: 0;
			width: 100%;
			justify-content: center;
		}
		.section-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 1.5rem;
		}
		.btn-primary {
			width: 100%;
			justify-content: center;
		}
		.keys-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
