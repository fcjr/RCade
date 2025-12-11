<script lang="ts">
	interface Props {
		src?: string;
		alt?: string;
		initials?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		class?: string;
	}

	let { src, alt = 'Avatar', initials, size = 'md', class: className = '' }: Props = $props();

	const sizeMap = {
		sm: 'w-8 h-8 text-xs',
		md: 'w-10 h-10 text-sm',
		lg: 'w-16 h-16 text-lg',
		xl: 'w-24 h-24 text-2xl'
	};

	const classes = ['avatar', sizeMap[size], className].filter(Boolean).join(' ');
</script>

{#if src}
	<img {src} {alt} class={classes} />
{:else if initials}
	<div class={`${classes} avatar-placeholder`}>
		{initials}
	</div>
{/if}

<style>
	.avatar {
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
		border: 1px solid rgba(255, 255, 255, 0.1);
		font-family: var(--font-heading);
		font-weight: 700;
		color: var(--color-primary);
	}
</style>
