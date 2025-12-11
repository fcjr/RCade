<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import StatusBar from '$lib/component/StatusBar.svelte';
	import Footer from '$lib/component/Footer.svelte';
	import Header from '$lib/component/Header.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="darkreader-lock" content="" />
</svelte:head>

<Header />

{@render children()}

<Footer />

<style>
	@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Jersey+15&family=Jersey+10&family=Chakra+Petch:wght@500;600;700&family=Orbitron:wght@500;700&family=Roboto+Mono:wght@400;700&display=block');

	:global(body) {
		margin: 0;
		padding: 0;
		font-family: 'DM Sans', sans-serif;
		background: #050505;
		color: #f5f5f5;
		overflow-x: hidden;
	}
</style>
