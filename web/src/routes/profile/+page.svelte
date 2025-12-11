<script lang="ts">
	import { page } from '$app/state';
	import { scale, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import type { PageData } from './$types';
	import ProfileHeader from '$lib/component/sections/ProfileHeader.svelte';
	import APIKeyCard from '$lib/component/sections/APIKeyCard.svelte';
	import SectionHeader from '$lib/component/common/SectionHeader.svelte';

	let { data }: { data: PageData } = $props();

	let user = page.data.session!.user as any; // Type coercion needed for null name support

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

	let deletingIds = $state(new Set<string>());
	let generateError = $state<string | null>(null);

	async function deleteKey(keyId: string) {
		throw new Error('Not implemented');
	}
</script>

<div class="app">
	<div class="ambient-glow"></div>

	<div class="container">
		<main>
			<ProfileHeader {user} />
		</main>
	</div>
</div>

<style>
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

	main {
		position: relative;
	}

	.controls-section {
		padding-bottom: var(--spacing-3xl);
	}

	.error-msg {
		color: #ef4444;
		font-size: 0.85rem;
		margin-top: var(--spacing-md);
		background: rgba(239, 68, 68, 0.1);
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		border: 1px solid rgba(239, 68, 68, 0.2);
	}

	.keys-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: var(--spacing-lg);
	}

	@media (max-width: 768px) {
		.container {
			padding: 0 1.5rem;
		}

		.keys-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.container {
			padding: 0 1rem;
		}
	}
</style>
