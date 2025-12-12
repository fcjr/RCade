<script lang="ts">
	import "./layout.css";
	import "$lib/fonts.css";
	import favicon from "$lib/assets/favicon.svg";
	import { onMount } from "svelte";

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
