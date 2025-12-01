<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>RCade</title>
</svelte:head>

<h1>RCade</h1>
<p>Play arcade games from the Recurse Center community.</p>

{#if !data.session?.user}
	<p><a href="/auth/signIn">Sign in</a> to access more games.</p>
{/if}

<h2>Games</h2>
{#if data.games.length === 0}
	<p>No games available yet.</p>
{:else}
	<ul>
		{#each data.games as game}
			{@const latestVersion = game.versions[0]}
			<li>
				<!-- full reload req for COOP/COEP headers (SharedArrayBuffer) -->
				<a href="/games/{game.name}" data-sveltekit-reload>{latestVersion?.displayName || game.name}</a>
				{#if latestVersion?.description}
					- {latestVersion.description}
				{/if}
				{#if latestVersion?.visibility === "internal"}
					<em>(Recursers only)</em>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<hr />
<p><a href="https://github.com/fcjr/rcade">View on GitHub</a></p>
