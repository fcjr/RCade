<script lang="ts">
    import { INJECT_SCRIPT } from "$lib/injection_script";
    import { onMount } from "svelte";

    onMount(() => {
        eval(INJECT_SCRIPT);
    });
</script>
