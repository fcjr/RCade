<script lang="ts">
	interface Props {
		active?: boolean;
		class?: string;
		children: any;
	}

	let { active = false, class: className = '' }: Props = $props();
</script>

<div class={`status-indicator ${active ? 'active' : ''} ${className}`}></div>

<style>
	.status-indicator {
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
</style>
