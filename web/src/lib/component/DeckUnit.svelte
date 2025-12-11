<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		serialNo: string;
		class?: string;
		children: Snippet;
	}

	let { serialNo, class: className = '', children }: Props = $props();
</script>

<div class="deck-unit {className}">
	<div class="mount-holes">
		<div class="screw"></div>
		<div class="serial-no">{serialNo}</div>
		<div class="screw"></div>
	</div>
	{@render children()}
</div>

<style>
	.deck-unit {
		background: #1e2124;
		border: 1px solid #000;
	}

	.mount-holes {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: #15171a;
		border-bottom: 1px solid #000;
	}

	.screw {
		width: 10px;
		height: 10px;
		background: #333;
		border-radius: 50%;
		box-shadow: inset 1px 1px 2px #000;
		position: relative;
	}

	.screw::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 1px;
		right: 1px;
		height: 1px;
		background: #555;
		transform: rotate(-45deg);
	}

	.serial-no {
		font-size: 0.6rem;
		color: #555;
		letter-spacing: 2px;
		font-weight: 700;
	}
</style>
