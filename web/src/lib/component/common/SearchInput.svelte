<script lang="ts">
	interface Props {
		value?: string;
		placeholder?: string;
		class?: string;
		onchange?: (value: string) => void;
		oninput?: (value: string) => void;
	}

	let {
		value = $bindable(''),
		placeholder = 'Search...',
		class: className = '',
		onchange,
		oninput
	}: Props = $props();
</script>

<div class={`search-input ${className}`}>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="search-icon"
	>
		<circle cx="11" cy="11" r="8"></circle>
		<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
	</svg>

	<input
		type="text"
		bind:value
		{placeholder}
		oninput={(e) => {
			value = (e.target as HTMLInputElement).value;
			if (oninput) oninput(value);
		}}
		onchange={(e) => {
			value = (e.target as HTMLInputElement).value;
			if (onchange) onchange(value);
		}}
		class="input"
	/>

	{#if value}
		<button
			class="clear-btn"
			onclick={() => {
				value = '';
				if (onchange) onchange('');
			}}
			aria-label="Clear search"
		>
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
			>
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		</button>
	{/if}
</div>

<style>
	.search-input {
		display: flex;
		align-items: center;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
		transition: all 0.2s;
		color: rgba(255, 255, 255, 0.4);
		gap: 0.75rem;
		position: relative;
	}

	.search-input:focus-within {
		border-color: var(--color-primary);
		background: rgba(0, 0, 0, 0.5);
		color: rgba(255, 255, 255, 0.7);
	}

	.search-icon {
		flex-shrink: 0;
		color: inherit;
	}

	.input {
		background: transparent;
		border: none;
		color: #fff;
		font-family: var(--font-body);
		font-size: 1rem;
		flex: 1;
		outline: none;
		text-transform: uppercase;
	}

	.input::placeholder {
		color: rgba(255, 255, 255, 0.2);
	}

	.clear-btn {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
		flex-shrink: 0;
	}

	.clear-btn:hover {
		color: rgba(255, 255, 255, 0.7);
	}
</style>
