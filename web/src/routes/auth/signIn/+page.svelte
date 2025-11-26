<script lang="ts">
	import { signIn, signOut } from '@auth/sveltekit/client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<p>Hi :3 you want to login?</p>

<button onclick={() => signIn('recurse')}>Sign in :3</button>
<button onclick={() => signOut()}>Sign out :O</button>

<p>also u are: {JSON.stringify(data.session?.user)}</p>
