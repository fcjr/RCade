<script lang="ts">
    import { inject } from "$lib/inject";
    import { onMount } from "svelte";

    onMount(() => {
        inject();
    });
</script>
