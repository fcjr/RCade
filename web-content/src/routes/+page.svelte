<script lang="ts">
    import { onMount } from "svelte";

    let state_name = $state("Uninitialized");
    let state = $state("Waiting");

    onMount(() => {
        let cur_name = (globalThis as any).RCADE_CONTENT_STATE_CUR_NAME;
        let cur_state = (globalThis as any).RCADE_CONTENT_STATE_CUR_STATE;

        if (cur_name) {
            state_name = cur_name;
        }

        if (cur_state) {
            state = cur_state;
        }

        (globalThis as any).RCADE_CONTENT_ENV = "SvelteEnv";
        (globalThis as any).RCADE_CONTENT_STATE_UPDATE = (
            name: string,
            state: string,
        ) => {
            state_name = name;
            state = state;
        };

        return () => {
            delete (globalThis as any).RCADE_CONTENT_ENV;
            delete (globalThis as any).RCADE_CONTENT_STATE_UPDATE;
        };
    });
</script>

<div class="wrapper">
    <p class="loading">{state_name}</p>
    <code class="state">{state}</code>
</div>

<style>
    .wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: 2rem;
        padding: 2rem;
    }

    .loading {
        font-size: 2.5rem;
        font-weight: 700;
        margin: 0;
        color: #ffffff;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        letter-spacing: -0.5px;
    }

    .state {
        display: none;
        padding: 1.5rem;
        background-color: #1e1e1e;
        color: #d4d4d4;
        border: 1px solid #333;
        border-radius: 12px;
        font-family: "SF Mono", "Courier New", Consolas, monospace;
        font-size: 1.25rem;
        font-weight: bold;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        max-width: 800px;
        width: 100%;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
        overflow-x: auto;
    }

    .state:not(:empty) {
        display: block;
    }
</style>
