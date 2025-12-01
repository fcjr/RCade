<script lang="ts">
	const { size, color }: { size: number; color: string } = $props();
</script>

<svg
	width="{size}px"
	height="{size}px"
	version="1.1"
	viewBox="0 0 1200 1200"
	xmlns="http://www.w3.org/2000/svg"
>
	<path
		d="m600 60c-298.23 0-540 241.77-540 540s241.77 540 540 540 540-241.77 540-540-241.77-540-540-540zm261.43 564.89-409.96 236.69c-19.16 11.062-43.113-2.7656-43.113-24.891v-473.38c0-22.125 23.953-35.953 43.113-24.891l409.96 236.69c19.16 11.062 19.16 38.719 0 49.781z"
		fill={color}
	/>
</svg>
