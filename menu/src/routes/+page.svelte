<script lang="ts">
    import BackgroundOverlay from "$lib/components/BackgroundOverlay.svelte";
    import { fly } from "svelte/transition";
    // Switched to quartOut for a more aggressive, "mechanical" deceleration
    import { quartOut } from "svelte/easing";

    const pagesData = [
        {
            gameName: "Neon Racer",
            id: "neon-racer",
            version: "1.0.2",
            description: "High-speed pursuit in a digital void.",
            authors: [
                { name: "Kaito_Dev", role: "Code" },
                { name: "Vapor.Art", role: "Visuals" },
            ],
            categories: [
                { name: "racing", description: "" },
                { name: "arcade", description: "" },
            ],
            dependencies: [
                { name: "@rcade/input-classic" },
                { name: "@rcade/input-spinners" },
            ],
        },
        {
            gameName: "Cyber Golf",
            id: "cyber-golf",
            version: "2.1.0",
            description: "Physics-based putting in zero gravity.",
            authors: [{ name: "Orbit_Studio", role: "Dev" }],
            categories: [
                { name: "sport", description: "" },
                { name: "sim", description: "" },
                { name: "relax", description: "" },
            ],
            dependencies: [
                { name: "@rcade/physics-core" },
                { name: "@rcade/haptic-feedback" },
            ],
        },
        {
            gameName: "Void Fighter",
            id: "void-fighter-ii",
            version: "0.9.5",
            description: "1v1 combat at the edge of the universe.",
            authors: [
                { name: "Ryu_X", role: "Code" },
                { name: "Ken_Y", role: "Audio" },
            ],
            categories: [
                { name: "fighting", description: "" },
                { name: "multiplayer", description: "" },
            ],
            dependencies: [
                { name: "@rcade/net-play" },
                { name: "@rcade/input-stick" },
            ],
        },
        {
            gameName: "Pixel Quest",
            id: "pixel-quest",
            version: "3.0.1",
            description:
                "A tiny hero in a massive procedurally generated dungeon.",
            authors: [{ name: "Bit_Wizard", role: "Code" }],
            categories: [
                { name: "rpg", description: "" },
                { name: "roguelike", description: "" },
            ],
            dependencies: [
                { name: "@rcade/save-state" },
                { name: "@rcade/audio-8bit" },
            ],
        },
        {
            gameName: "Echo Synth",
            id: "echo-synth",
            version: "1.0.0",
            description: "Create music by manipulating light beams.",
            authors: [
                { name: "Soundwave", role: "Audio" },
                { name: "Lumens", role: "Visuals" },
            ],
            categories: [
                { name: "music", description: "" },
                { name: "tool", description: "" },
            ],
            dependencies: [
                { name: "@rcade/midi-out" },
                { name: "@rcade/screen-touch" },
            ],
        },
    ];

    let totalPages = pagesData.length;
    let activePage = 0;
    let direction = 1;

    $: current = pagesData[activePage];

    function getDepLabel(name: string) {
        return name;
    }

    function setPage(index: number) {
        if (index === activePage) return;
        direction = index > activePage ? 1 : -1;
        activePage = index;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowLeft") {
            const newPage = Math.max(0, activePage - 1);
            if (newPage !== activePage) {
                direction = -1;
                activePage = newPage;
            }
        } else if (e.key === "ArrowRight") {
            const newPage = Math.min(totalPages - 1, activePage + 1);
            if (newPage !== activePage) {
                direction = 1;
                activePage = newPage;
            }
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<main>
    <div class="bg-layer">
        <div style="width:100%; height:100%; background: #111;"></div>
        <BackgroundOverlay />
    </div>

    <div class="ui-layer">
        <div class="top-section">
            <div class="pagination">
                {#each Array(totalPages) as _, i}
                    <div
                        class="dot"
                        class:active={i === activePage}
                        on:click={() => setPage(i)}
                        role="button"
                        tabindex="0"
                    ></div>
                {/each}
            </div>
            {#if current.categories.length > 0}
                <div class="category-strip">
                    {#each current.categories as category}
                        <span class="category-tag">
                            <span class="tag-hash">#</span>{category.name}
                        </span>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="content-stage">
            {#key activePage}
                <div
                    class="slide-container"
                    in:fly={{
                        x: 10 * direction,
                        duration: 150,
                        delay: 0,
                        easing: quartOut,
                    }}
                    out:fly={{
                        x: -10 * direction,
                        duration: 150,
                        easing: quartOut,
                    }}
                >
                    <div class="bottom-section">
                        <div class="header-group">
                            <div class="meta-line">
                                <span class="meta-id">{current.id}</span>
                                <span class="meta-slash">/</span>
                                <span class="meta-ver">v{current.version}</span>
                            </div>
                            <h1 class="game-title">{current.gameName}</h1>
                            <p class="game-desc">{current.description}</p>
                        </div>

                        <div class="data-grid">
                            <div class="grid-row">
                                <div class="grid-label">AUTHORS</div>
                                <div class="grid-content authors-content">
                                    {#each current.authors as author}
                                        <div class="data-entry">
                                            <span class="entry-main"
                                                >{author.name}</span
                                            >
                                        </div>
                                    {/each}
                                </div>
                            </div>

                            <div class="grid-row">
                                <div class="grid-label">PLUGINS</div>
                                <div class="grid-content">
                                    {#each current.dependencies as dep}
                                        <div class="data-entry">
                                            <span class="entry-main"
                                                >{getDepLabel(dep.name)}</span
                                            >
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/key}
        </div>
    </div>
</main>

<style>
    :root {
        --color-primary: #facc15;
        --color-text-primary: #ffffff;
        --color-text-secondary: rgba(255, 255, 255, 0.6);

        --font-display: "Syne", sans-serif;
        --font-body: "DM Sans", sans-serif;
        --font-mono: "JetBrains Mono", monospace;
    }

    main {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background-color: #000;
        font-family: var(--font-body);
        color: var(--color-text-primary);
    }

    .bg-layer {
        position: absolute;
        inset: 0;
        z-index: 0;
        opacity: 0.5;
    }

    .ui-layer {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 16px 0;
        box-sizing: border-box;
    }

    /* --- Top Section --- */
    .top-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        margin-bottom: auto;
        padding: 0 16px;
        box-sizing: border-box;
    }

    /* --- Content Stage --- */
    .content-stage {
        flex: 1;
        display: grid;
        grid-template-areas: "stack";
        align-items: end;
        overflow: hidden;
        width: 100%;
    }

    .slide-container {
        grid-area: stack;
        width: 100%;
    }

    /* --- Bottom Content --- */
    .bottom-section {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 0 16px;
        box-sizing: border-box;
    }

    /* --- Pagination --- */
    .pagination {
        display: flex;
        justify-content: center;
        gap: 6px;
        margin-bottom: 12px;
        margin-top: 5px;
    }

    .dot {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.2);
        transition: all 0.3s;
        cursor: pointer;
    }

    .dot:hover {
        background-color: rgba(255, 255, 255, 0.5);
    }

    .dot.active {
        background-color: var(--color-primary);
        transform: scale(1.5);
        box-shadow:
            0 0 6px var(--color-primary),
            0 0 10px var(--color-primary);
    }

    /* --- Tags --- */
    .category-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
    }

    .category-tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.5);
        font-family: var(--font-mono);
        font-size: 0.5rem;
        text-transform: uppercase;
        font-weight: 500;
        line-height: 1;
        letter-spacing: 0.02em;
        transition: all 0.2s ease;
        cursor: default;
    }

    .category-tag:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.9);
    }

    .tag-hash {
        color: var(--color-primary);
        margin-right: 4px;
        opacity: 0.4;
        font-size: 0.9em;
    }

    .category-tag:hover .tag-hash {
        opacity: 0.8;
    }

    /* Header Group */
    .header-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .meta-line {
        font-family: var(--font-mono);
        font-size: 0.45rem;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.5);
        display: flex;
        gap: 4px;
        align-items: center;
    }
    .meta-slash {
        color: var(--color-primary);
        font-weight: bold;
    }
    .meta-ver {
        opacity: 0.5;
    }

    .game-title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 1.6rem;
        line-height: 0.95;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: white;
    }

    .game-desc {
        margin: 0;
        margin-top: 4px;
        font-size: 0.65rem;
        color: var(--color-text-secondary);
        line-height: 1.3;
        max-width: 85%;
    }

    /* --- The Data Grid --- */
    .data-grid {
        display: flex;
        flex-direction: column;
    }

    .grid-row {
        display: grid;
        grid-template-columns: 40px 1fr;
        align-items: baseline;
        padding-top: 6px;
    }

    .grid-row:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .grid-label {
        font-family: var(--font-mono);
        font-size: 0.4rem;
        color: var(--color-primary);
        letter-spacing: 0.05em;
        opacity: 0.9;
        padding-top: 1px;
    }

    .grid-content {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
    }

    .data-entry {
        font-family: var(--font-mono);
        font-size: 0.5rem;
        display: flex;
        align-items: center;
        gap: 2px;
        color: rgba(255, 255, 255, 0.85);
    }
</style>
