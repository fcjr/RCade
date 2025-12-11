<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
	import Avatar from '../common/Avatar.svelte';
	import Button from '../common/Button.svelte';

	interface Props {
		user: {
			name?: string;
			email?: string;
			image?: string;
			github?: string;
			twitter?: string;
			linkedin?: string;
			personal_site_url?: string;
		};
	}

	let { user }: Props = $props();

	const initials = $derived(
		user
			.name!.split(' ')
			.map((n: string) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2)
	);
</script>

<section class="profile-header">
	<div class="avatar-wrapper">
		<Avatar src={user.image} {initials} size="xl" />
		<div class="status-indicator active"></div>
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

	<Button variant="secondary" size="md" class="sign-out-btn" onclick={() => signOut()}>
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
			><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"
			></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg
		>
	</Button>
</section>

<style>
	.profile-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-2xl);
		padding: var(--spacing-3xl) 0 var(--spacing-2xl);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: var(--spacing-2xl);
	}

	.avatar-wrapper {
		position: relative;
	}

	.status-indicator {
		position: absolute;
		bottom: 5px;
		right: 5px;
		width: 16px;
		height: 16px;
		background: #ef4444;
		border: 3px solid #050505;
		border-radius: 50%;
		transition: background 0.2s;
	}

	.status-indicator.active {
		background: #4ade80;
		box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
	}

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
		font-family: var(--font-body);
		font-size: 3rem;
		line-height: 0.8;
		font-weight: 800;
		margin: 0;
		background: #fff;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.email {
		margin: 0;
		color: rgba(255, 255, 255, 0.6);
		font-family: var(--font-mono);
		font-size: 0.95rem;
	}

	.social-links {
		display: flex;
		gap: 0.75rem;
	}

	.social-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.2s;
		text-decoration: none;
	}

	.social-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--color-primary);
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
	}

	@media (max-width: 1024px) {
		.profile-header {
			flex-wrap: wrap;
		}
	}

	@media (max-width: 640px) {
		.profile-header {
			flex-direction: column;
			text-align: center;
			gap: var(--spacing-lg);
			padding: var(--spacing-2xl) 0;
		}

		.profile-info h1 {
			font-size: 2rem;
		}

		.social-links {
			justify-content: center;
		}
	}
</style>
