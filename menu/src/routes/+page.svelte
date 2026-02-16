<script lang="ts">
    import BackgroundOverlay from "$lib/components/BackgroundOverlay.svelte";
    import { fly, slide } from "svelte/transition";
    import {
        getGames,
        getLastGame,
        onGameLoad,
        onGameQuit,
        onMenuRequested,
        playGame,
    } from "@rcade/plugin-menu";
    import { quartOut } from "svelte/easing";
    import { tick, onMount } from "svelte";
    import { Game } from "@rcade/api";
    import { on as onInput } from "@rcade/plugin-input-classic";
    import { PLAYER_1 as SPINNERS_P1 } from "@rcade/plugin-input-spinners";
    import { SCREENSAVER } from "@rcade/plugin-sleep";
    import EventEmitter from "events";
    import { Fireworks, type FireworksOptions } from "@fireworks-js/svelte";
    import { play_menu_move, preloadMenuSound } from "$lib/audio";

    // Dummy function to load games - replace with actual API call
    async function loadGames(): Promise<Game[]> {
        return (await getGames()).map((response: any) =>
            Game.fromApiResponse(response),
        );
    }

    async function refreshGames() {
        const currentGameId = currentGame?.id();
        const loadedGames = await loadGames();
        games = loadedGames;

        await tick();

        // Try to stay on the same game after refresh
        if (currentGameId && loadedGames.length > 0) {
            const index = filteredGames.findIndex(
                (game) => game.id() === currentGameId,
            );
            if (index !== -1) {
                setPage(index);
            }
        }

        updateVersionMasks();
        updateFilterMasks();
        updatePaginationState();
    }

    let screensaverActive = false;

    SCREENSAVER.addEventListener("started", () => {
        viewportState = "neutral";
        screensaverActive = true;
    });

    SCREENSAVER.addEventListener("stopped", () => {
        screensaverActive = false;
    });

    const DELTA_EPSILON = 10;
    const DELTA_DECAY = 0.92; // Exponential decay factor per frame
    const SLIDE_SCALE = 1.5; // How much accumulatedDelta affects slide (pixels per unit)
    const MAX_SLIDE = 20; // Maximum slide distance in pixels
    let accumulatedDelta = 0;
    let slideOffset = 0; // Current visual slide of the page

    // run consume deltas every frame
    function frameLoop() {
        if (gameActive) {
            requestAnimationFrame(frameLoop);
            return;
        }

        // Read spinner delta (resets after read) and accumulate
        accumulatedDelta += SPINNERS_P1.SPINNER.consume_step_delta();

        // Apply exponential decay to accumulatedDelta
        if (Math.abs(accumulatedDelta) > 0.01) {
            accumulatedDelta *= DELTA_DECAY;
        } else {
            accumulatedDelta = 0;
        }

        // Calculate slide offset based on accumulated delta (clamped)
        slideOffset = Math.max(-MAX_SLIDE, Math.min(MAX_SLIDE, accumulatedDelta * SLIDE_SCALE));

        // for every DELTA_EPSILON in delta, emit left/right move
        while (Math.abs(accumulatedDelta) >= DELTA_EPSILON) {
            if (viewportState === "neutral") {
                if (accumulatedDelta > 0) {
                    const newPage = Math.min(totalPages - 1, activePage + 1);
                    if (newPage !== activePage) {
                        setPage(newPage);
                        moveEvents.emit("move", false); // Emit false for right
                    }
                    accumulatedDelta -= DELTA_EPSILON;
                } else if (accumulatedDelta < 0) {
                    const newPage = Math.max(0, activePage - 1);
                    if (newPage !== activePage) {
                        setPage(newPage);
                        moveEvents.emit("move", true); // Emit true for left
                    }
                    accumulatedDelta += DELTA_EPSILON;
                }
            } else if (viewportState === "show-top") {
                if (accumulatedDelta > 0) {
                    const newIndex = Math.min(
                        uniqueTags.length - 1,
                        filterCursorIndex + 1,
                    );
                    filterCursorIndex = newIndex;
                    triggerScroll(
                        filtersContainer,
                        filterCursorIndex,
                        false,
                        updateFilterMasks,
                    );
                    accumulatedDelta -= DELTA_EPSILON;
                } else if (accumulatedDelta < 0) {
                    const newIndex = Math.max(0, filterCursorIndex - 1);
                    filterCursorIndex = newIndex;
                    triggerScroll(
                        filtersContainer,
                        filterCursorIndex,
                        false,
                        updateFilterMasks,
                    );
                    accumulatedDelta += DELTA_EPSILON;
                }
            } else if (viewportState === "show-bottom" && currentGame) {
                if (accumulatedDelta > 0) {
                    const newIndex = Math.min(
                        currentGame.versions().length - 1,
                        activeVersionIndex + 1,
                    );
                    activeVersionIndex = newIndex;
                    triggerScroll(
                        versionsContainer,
                        activeVersionIndex,
                        false,
                        updateVersionMasks,
                    );
                    accumulatedDelta -= DELTA_EPSILON;
                } else if (accumulatedDelta < 0) {
                    const newIndex = Math.max(0, activeVersionIndex - 1);
                    activeVersionIndex = newIndex;
                    triggerScroll(
                        versionsContainer,
                        activeVersionIndex,
                        false,
                        updateVersionMasks,
                    );
                    accumulatedDelta += DELTA_EPSILON;
                }
            }
        }

        requestAnimationFrame(frameLoop);
    }
    requestAnimationFrame(frameLoop);

    let games: Game[] = [];
    let loading = true;

    onMount(() => {
        // Register input handlers
        const unsubPress = registerPressHandler();
        const unsubInputEnd = registerInputEndHandler();

        // Subscribe to menu key to refresh games list
        onMenuRequested(() => {
            refreshGames();
        });

        preloadMenuSound();

        // Load games
        loadGames().then((loadedGames) => {
            games = loadedGames;

            tick().then(() => {
                updateVersionMasks();
                updateFilterMasks();
                updatePaginationState();

                if (games.length > 0) {
                    getLastGame().then((id) => {
                        let index = filteredGames.findIndex(
                            (game) => game.id() == id,
                        );

                        if (index != -1) setPage(index);

                        loading = false;
                    });
                } else {
                    loading = false;
                }
            });
        });

        return () => {
            unsubPress();
            unsubInputEnd();
        };
    });

    // --- FILTER LOGIC ---
    $: uniqueTags = [
        ...new Set(
            games.flatMap((g) =>
                g
                    .latest()
                    .categories()
                    .map((c) => c.name),
            ),
        ),
    ].sort();

    let selectedTags: string[] = [];
    let filterCursorIndex = 0;

    $: filteredGames =
        selectedTags.length === 0
            ? games
            : games.filter((g) =>
                  g
                      .latest()
                      .categories()
                      .some((c) => selectedTags.includes(c.name)),
              );

    $: totalPages = filteredGames.length;

    // --- NAVIGATION STATE ---
    let activePage = 0;
    let activeVersionIndex = 0;
    let direction = 1;
    let viewportState: "neutral" | "show-top" | "show-bottom" = "neutral";
    let gameActive = false;
    SCREENSAVER.updateScreensaver({ transparent: true });

    let versionsContainer: HTMLDivElement;
    let filtersContainer: HTMLDivElement;
    let paginationContainer: HTMLDivElement;

    // Mask Variables
    let maskLeftSize = "0px";
    let maskRightSize = "0px";
    let filterMaskLeft = "0px";
    let filterMaskRight = "0px";

    // Pagination specific variables
    let paginationMaskLeft = "0px";
    let paginationMaskRight = "0px";
    let pagesHiddenLeft = 0;
    let pagesHiddenRight = 0;

    $: currentGame = filteredGames[activePage];
    $: currentVersion = currentGame?.versions()[activeVersionIndex];

    // RESET LOGIC
    let lastGameId = "";
    $: if (currentGame && currentGame.id() !== lastGameId) {
        lastGameId = currentGame.id();
        activeVersionIndex = currentGame.versions().length - 1;

        if (viewportState === "show-bottom") {
            tick().then(() => {
                triggerScroll(
                    versionsContainer,
                    activeVersionIndex,
                    true,
                    updateVersionMasks,
                );
            });
        }
    }

    // --- PAGINATION SYNC ---
    $: if (paginationContainer && activePage >= 0) {
        tick().then(() => {
            triggerScroll(
                paginationContainer,
                activePage,
                false,
                updatePaginationState,
            );
        });
    }

    // --- SCROLL UTILS ---
    function updateVersionMasks() {
        if (!versionsContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = versionsContainer;
        maskLeftSize = scrollLeft > 10 ? "20px" : "0px";
        maskRightSize =
            scrollWidth - clientWidth - scrollLeft > 10 ? "20px" : "0px";
    }

    function updateFilterMasks() {
        if (!filtersContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = filtersContainer;
        filterMaskLeft = scrollLeft > 10 ? "20px" : "0px";
        filterMaskRight =
            scrollWidth - clientWidth - scrollLeft > 10 ? "20px" : "0px";
    }

    function updatePaginationState() {
        if (!paginationContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = paginationContainer;

        paginationMaskLeft = scrollLeft > 5 ? "30px" : "0px";
        paginationMaskRight =
            scrollWidth - clientWidth - scrollLeft > 5 ? "30px" : "0px";

        if (scrollWidth <= clientWidth) {
            pagesHiddenLeft = 0;
            pagesHiddenRight = 0;
            return;
        }

        const children = Array.from(
            paginationContainer.children,
        ) as HTMLElement[];

        const leftThreshold = scrollLeft;
        const rightThreshold = scrollLeft + clientWidth;

        let leftCount = 0;
        let rightCount = 0;

        children.forEach((child) => {
            const childCenter = child.offsetLeft + child.offsetWidth / 2;
            if (childCenter < leftThreshold) leftCount++;
            if (childCenter > rightThreshold) rightCount++;
        });

        pagesHiddenLeft = leftCount;
        pagesHiddenRight = rightCount;
    }

    let scrollFrame: number;

    function tweenScroll(
        container: HTMLElement,
        target: number,
        callback: () => void,
    ) {
        if (scrollFrame) cancelAnimationFrame(scrollFrame);

        const start = container.scrollLeft;
        const dist = target - start;
        const duration = 200;
        const startTime = performance.now();
        const ease = (t: number) => 1 - Math.pow(1 - t, 4);

        function step(currentTime: number) {
            const elapsed = currentTime - startTime;
            if (elapsed >= duration) {
                container.scrollLeft = target;
                callback();
                return;
            }
            const progress = ease(elapsed / duration);
            container.scrollLeft = start + dist * progress;
            callback();
            scrollFrame = requestAnimationFrame(step);
        }
        scrollFrame = requestAnimationFrame(step);
    }

    function triggerScroll(
        container: HTMLElement,
        targetIndex: number,
        instant: boolean,
        updateFn: () => void,
    ) {
        if (
            !container ||
            !container.children ||
            !container.children[targetIndex]
        )
            return;

        const targetEl = container.children[targetIndex] as HTMLElement;
        const containerCenter = container.clientWidth / 2;
        const elCenter = targetEl.offsetLeft + targetEl.offsetWidth / 2;

        const maxScroll = container.scrollWidth - container.clientWidth;
        let targetScroll = elCenter - containerCenter;

        if (maxScroll > 0) {
            targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
        } else {
            targetScroll = 0;
        }

        if (instant) {
            if (scrollFrame) cancelAnimationFrame(scrollFrame);
            container.scrollLeft = targetScroll;
            updateFn();
        } else {
            tweenScroll(container, targetScroll, updateFn);
        }
    }

    function setPage(index: number) {
        if (index === activePage) return;
        direction = index > activePage ? 1 : -1;
        activePage = index;
    }

    function toggleFilter(tag: string) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter((t) => t !== tag);
        } else {
            selectedTags = [...selectedTags, tag];
        }
        activePage = 0;
        tick().then(updatePaginationState);
    }

    let gameLoading = false;
    let gameError: string | undefined = undefined;

    function startGame(game: any, version: string) {
        playGame(game, version);
        gameLoading = true;
    }

    onGameQuit((quitOptions) => {
        // todo: handle quit error
        console.error(quitOptions);
        gameActive = false;
        SCREENSAVER.updateScreensaver({ transparent: true });
    });

    onGameLoad((result) => {
        if (result !== undefined) {
            gameError = result.error;
        } else {
            gameActive = true;
            SCREENSAVER.updateScreensaver({ transparent: false });
        }

        gameLoading = false;
    });

    function registerPressHandler() {
        return onInput("press", (e) => {
            if (gameError) {
                // Allow A or B to dismiss the error
                if ((e.button === "B" || e.button === "A") && e.player == 1) {
                    gameError = undefined;
                    // Ensure loading is off if we just dismissed an error
                    gameLoading = false;
                }
                return;
            }

            if (screensaverActive || gameActive || gameLoading) {
                return;
            }

            if (e.button === "DOWN" && e.player == 1) {
                if (viewportState === "show-top") {
                    viewportState = "neutral";
                } else if (currentGame) {
                    viewportState = "show-bottom";
                    tick().then(() =>
                        triggerScroll(
                            versionsContainer,
                            activeVersionIndex,
                            true,
                            updateVersionMasks,
                        ),
                    );
                }
            } else if (e.button === "UP" && e.player == 1) {
                if (viewportState === "show-bottom") {
                    viewportState = "neutral";
                } else {
                    viewportState = "show-top";
                    tick().then(() =>
                        triggerScroll(
                            filtersContainer,
                            filterCursorIndex,
                            true,
                            updateFilterMasks,
                        ),
                    );
                }
            }

            if (
                e.button === "A" &&
                e.player == 1 &&
                viewportState === "show-top"
            ) {
                if (uniqueTags.length === 0) return;

                toggleFilter(uniqueTags[filterCursorIndex]);
            }

            if (
                e.button === "A" &&
                e.player == 1 &&
                viewportState === "show-bottom"
            ) {
                activeVersionIndex = activeVersionIndex; // Trigger reactive update
                viewportState = "neutral";
            }

            if (
                e.button === "A" &&
                e.player == 1 &&
                viewportState === "neutral"
            ) {
                startGame(
                    currentGame.intoApiResponse(),
                    currentVersion.version(),
                );
            }

            if (
                e.button === "B" &&
                e.player == 1 &&
                viewportState === "neutral"
            ) {
                startGame(
                    currentGame.intoApiResponse(),
                    currentVersion.version(),
                );
            } else if (e.button === "B" && e.player == 1) {
                viewportState = "neutral";
            }

            if (e.button === "ONE_PLAYER" && viewportState === "neutral") {
                startGame(
                    currentGame.intoApiResponse(),
                    currentVersion.version(),
                );
            }

            if (e.button === "TWO_PLAYER" && viewportState === "neutral") {
                startGame(
                    currentGame.intoApiResponse(),
                    currentVersion.version(),
                );
            }

            if (e.button === "LEFT" && e.player == 1) {
                if (viewportState === "show-bottom" && currentGame) {
                    const newIndex = Math.max(0, activeVersionIndex - 1);
                    activeVersionIndex = newIndex;
                    triggerScroll(
                        versionsContainer,
                        activeVersionIndex,
                        false,
                        updateVersionMasks,
                    );
                } else if (viewportState === "show-top") {
                    const newIndex = Math.max(0, filterCursorIndex - 1);
                    filterCursorIndex = newIndex;
                    triggerScroll(
                        filtersContainer,
                        filterCursorIndex,
                        false,
                        updateFilterMasks,
                    );
                } else {
                    const newPage = Math.max(0, activePage - 1);
                    if (newPage !== activePage) {
                        setPage(newPage);
                        moveEvents.emit("move", true); // Emit true for left
                    }
                }
            } else if (e.button === "RIGHT" && e.player == 1) {
                if (viewportState === "show-bottom" && currentGame) {
                    const newIndex = Math.min(
                        currentGame.versions().length - 1,
                        activeVersionIndex + 1,
                    );
                    activeVersionIndex = newIndex;
                    triggerScroll(
                        versionsContainer,
                        activeVersionIndex,
                        false,
                        updateVersionMasks,
                    );
                } else if (viewportState === "show-top") {
                    const newIndex = Math.min(
                        uniqueTags.length - 1,
                        filterCursorIndex + 1,
                    );
                    filterCursorIndex = newIndex;
                    triggerScroll(
                        filtersContainer,
                        filterCursorIndex,
                        false,
                        updateFilterMasks,
                    );
                } else {
                    const newPage = Math.min(totalPages - 1, activePage + 1);
                    if (newPage !== activePage) {
                        setPage(newPage);
                        moveEvents.emit("move", false); // Emit false for right
                    }
                }
            }

            // P2 dpad -- tilt controls
            if (e.button === "UP" && e.player == 2) {
                tiltX = -TILT_AMOUNT;
            } else if (e.button === "DOWN" && e.player == 2) {
                tiltX = TILT_AMOUNT;
            } else if (e.button === "LEFT" && e.player == 2) {
                tiltY = -TILT_AMOUNT;
            } else if (e.button === "RIGHT" && e.player == 2) {
                tiltY = TILT_AMOUNT;
            }

            // P2 A/B -- fireworks
            if (e.button === "A" && e.player == 2 && !p2APressed) {
                p2APressed = true;
                launchFireworks();
            } else if (e.button === "B" && e.player == 2 && !p2BPressed) {
                p2BPressed = true;
                launchFireworks();
            }
        });
    }

    // P2 release events
    function registerInputEndHandler() {
        return onInput("inputEnd", (e) => {
            if (e.player == 2) {
                // reset tilt on dpad release
                if (e.button === "UP" || e.button === "DOWN") {
                    tiltX = 0;
                } else if (e.button === "LEFT" || e.button === "RIGHT") {
                    tiltY = 0;
                }
                // reset button state on release
                if (e.button === "A") {
                    p2APressed = false;
                } else if (e.button === "B") {
                    p2BPressed = false;
                }
            }
        });
    }

    const moveEvents = new EventEmitter();

    moveEvents.on("move", () => {
        play_menu_move();
    });

    let fireworksComponent: Fireworks;
    let p2APressed = false;
    let p2BPressed = false;

    function launchFireworks() {
        fireworksComponent?.fireworksInstance()?.launch(1);
    }

    const fireworkOptions: FireworksOptions = {
        sound: {
            enabled: true,
            files: ["explosion0.mp3", "explosion1.mp3", "explosion2.mp3"],
        },
    };

    let tiltX = 0;
    let tiltY = 0;
    const TILT_AMOUNT = 15;
</script>

<svelte:window
    on:resize={() => {
        updateVersionMasks();
        updateFilterMasks();
        updatePaginationState();
    }}
/>

<main class:gameActive>
    <Fireworks
        class="fireworks"
        options={fireworkOptions}
        bind:this={fireworksComponent}
        autostart={false}
    />
    <div
        class="shifting-viewport"
        class:show-top={viewportState === "show-top"}
        class:show-bottom={viewportState === "show-bottom"}
        style:--tilt-x="{tiltX}deg"
        style:--tilt-y="{tiltY}deg"
        style:--slide-offset="{slideOffset}px"
    >
        <div class="filter-drawer">
            <div class="drawer-header">FILTER_SYSTEM</div>

            <div
                class="chips-container"
                bind:this={filtersContainer}
                on:scroll={updateFilterMasks}
                style="--mask-left: {filterMaskLeft}; --mask-right: {filterMaskRight};"
            >
                {#each uniqueTags as tag, i}
                    <div
                        class="version-chip filter-chip"
                        class:cursor-active={i === filterCursorIndex}
                        class:selected={selectedTags.includes(tag)}
                        on:click={() => {
                            filterCursorIndex = i;
                            toggleFilter(tag);
                        }}
                        role="button"
                        tabindex="0"
                    >
                        <span class="filter-check"
                            >[{selectedTags.includes(tag) ? "X" : " "}]</span
                        >
                        <span class="chip-text">#{tag}</span>
                    </div>
                {/each}
                {#if uniqueTags.length === 0}
                    <div class="no-filters">
                        <span>NO_FILTERS_AVAILABLE</span>
                    </div>
                {/if}
            </div>
        </div>

        <div class="bg-layer">
            <BackgroundOverlay events={moveEvents} />
        </div>

        <div class="ui-layer" class:screensaver={screensaverActive}>
            {#if loading}
                <div class="empty-state">
                    <span>LOADING_GAMES...</span>
                </div>
            {:else if selectedTags.length > 0}
                <div
                    class="filter-hud-static"
                    transition:slide|local={{ duration: 250, axis: "y" }}
                >
                    <div class="hud-inner">
                        <span class="hud-icon">FILTER_SYSTEM :: ACTIVE</span>
                        <span class="hud-msg"
                            >Use <span class="key">▲</span> to modify</span
                        >
                    </div>
                </div>
            {/if}
            {#if !loading && currentGame && currentVersion}
                <div class="top-section">
                    <div class="pagination-wrapper">
                        <div
                            class="pagination-counter left"
                            class:visible={pagesHiddenLeft > 0}
                        >
                            +{pagesHiddenLeft}
                        </div>

                        <div
                            class="pagination-scroll"
                            bind:this={paginationContainer}
                            on:scroll={updatePaginationState}
                            style="--mask-left: {paginationMaskLeft}; --mask-right: {paginationMaskRight};"
                        >
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

                        <div
                            class="pagination-counter right"
                            class:visible={pagesHiddenRight > 0}
                        >
                            +{pagesHiddenRight}
                        </div>
                    </div>

                    {#if currentVersion.categories().length > 0}
                        <div class="category-strip">
                            {#each currentVersion.categories() as category}
                                <span class="category-tag">
                                    <span class="tag-hash">#</span
                                    >{category.name}
                                </span>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="content-stage">
                    {#key currentGame.id()}
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
                                        <span class="meta-id"
                                            >{currentGame.name()}</span
                                        >
                                        <span class="meta-slash">/</span>
                                        <span class="meta-ver"
                                            >v{currentVersion.version()}</span
                                        >
                                    </div>
                                    <h1 class="game-title">
                                        {currentVersion.displayName() ||
                                            currentGame.name()}
                                    </h1>
                                    <p class="game-desc">
                                        {currentVersion.description() ||
                                            "No description available."}
                                    </p>
                                </div>

                                <div class="data-grid">
                                    <div class="grid-row">
                                        <div class="grid-label">AUTHORS</div>
                                        <div
                                            class="grid-content authors-content"
                                        >
                                            {#each currentVersion.authors() as author}
                                                <div class="data-entry">
                                                    <span class="entry-main"
                                                        >{author.display_name}</span
                                                    >
                                                </div>
                                            {/each}
                                        </div>
                                    </div>

                                    <div class="grid-row">
                                        <div class="grid-label">PLUGINS</div>
                                        <div class="grid-content">
                                            {#each currentVersion.dependencies() as dep}
                                                <div class="data-entry">
                                                    <span class="entry-main"
                                                        >{dep.name}</span
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
            {:else if !loading}
                <div class="empty-state">
                    <span>NO_GAMES_FOUND</span>
                </div>
            {/if}
        </div>

        {#if currentGame}
            <div class="version-drawer">
                <div class="drawer-header">VERSION_HISTORY</div>
                <div
                    class="chips-container"
                    bind:this={versionsContainer}
                    on:scroll={updateVersionMasks}
                    style="--mask-left: {maskLeftSize}; --mask-right: {maskRightSize};"
                >
                    {#each currentGame.versions() as ver, i}
                        <div
                            class="version-chip"
                            class:current={i === activeVersionIndex}
                            on:click={() => {
                                activeVersionIndex = i;
                                triggerScroll(
                                    versionsContainer,
                                    i,
                                    false,
                                    updateVersionMasks,
                                );
                            }}
                            role="button"
                            tabindex="0"
                        >
                            <span class="chip-text">{ver.version()}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
    {#if gameLoading}
        <div
            class="overlay-backdrop"
            transition:fly={{ duration: 400, opacity: 0 }}
        >
            <div class="mini-loader">
                <div class="loader-spinner-mini"></div>
                <div class="loader-content-mini">
                    <div class="loader-label">> SYSTEM_INIT</div>
                    <div class="loader-bar-mini">
                        <div class="loader-progress-mini"></div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    {#if gameError}
        <div
            class="overlay-backdrop error-mode"
            transition:slide={{ axis: "y", duration: 200 }}
        >
            <div class="mini-error-box">
                <div class="mini-err-header">
                    <span>(!) EXECUTION_FAILURE</span>
                </div>
                <div class="mini-err-body">
                    <p class="mini-err-msg">"{gameError}"</p>
                </div>
                <div class="mini-err-footer">
                    <span class="key-badge">B</span>
                    <span class="key-label">BACK</span>
                </div>
            </div>
        </div>
    {/if}
</main>

<style>
    :root {
        --color-primary: #facc15;
        --color-error: #ff3333;
        --color-text-primary: #ffffff;
        --color-text-secondary: rgba(255, 255, 255, 1);
        --drawer-height: 70px;
        --filter-drawer-height: 90px;

        --font-display: "Syne", sans-serif;
        --font-body: "DM Sans", sans-serif;
        --font-mono: "JetBrains Mono", monospace;

        --ease-snappy: cubic-bezier(0.165, 0.84, 0.44, 1);
    }

    .ui-layer {
        transition:
            opacity 0.4s ease,
            filter 0.4s ease;
    }

    .ui-layer.screensaver {
        opacity: 0;
        pointer-events: none;
    }

    main {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background-color: #000;
        font-family: var(--font-body);
        color: var(--color-text-primary);
        transition: opacity 0.3s;
        opacity: 1;
    }

    main.gameActive {
        opacity: 0;
    }

    .shifting-viewport {
        position: relative;
        width: 100%;
        height: 100%;
        will-change: transform;
        transition: transform 0.3s var(--ease-snappy);
        transform: perspective(400px) rotateX(var(--tilt-x, 0deg))
            rotateY(var(--tilt-y, 0deg));
    }

    .shifting-viewport.show-bottom {
        transform: perspective(400px) rotateX(var(--tilt-x, 0deg))
            rotateY(var(--tilt-y, 0deg))
            translateY(calc(var(--drawer-height) * -1));
    }
    .shifting-viewport.show-top {
        transform: perspective(400px) rotateX(var(--tilt-x, 0deg))
            rotateY(var(--tilt-y, 0deg))
            translateY(var(--filter-drawer-height));
    }

    .bg-layer {
        position: absolute;
        inset: 0;
        z-index: 0;
        opacity: 1;
        transition:
            filter 0.3s var(--ease-snappy),
            opacity 0.3s var(--ease-snappy);
    }

    .shifting-viewport.show-bottom .bg-layer,
    .shifting-viewport.show-top .bg-layer {
        filter: brightness(0.4);
        opacity: 0.5;
    }

    .ui-layer {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding-bottom: 16px;
        box-sizing: border-box;
        transition:
            filter 0.3s var(--ease-snappy),
            opacity 0.3s var(--ease-snappy);
    }

    .shifting-viewport.show-bottom .ui-layer,
    .shifting-viewport.show-top .ui-layer {
        filter: brightness(0.5);
        /* opacity: 0.3; */
    }

    .empty-state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        color: var(--color-primary);
        letter-spacing: 0.1em;
    }
    .version-drawer,
    .filter-drawer {
        position: absolute;
        left: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        padding: 0;
        box-sizing: border-box;
        gap: 6px;
    }
    .version-drawer,
    .filter-drawer {
        position: absolute;
        left: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        padding: 0;
        box-sizing: border-box;
        gap: 6px;
    }

    .version-drawer {
        top: 100%;
        height: var(--drawer-height);
        border-top: 1px solid rgba(250, 204, 21, 1);
    }

    .filter-drawer {
        bottom: 100%;
        height: var(--filter-drawer-height);
        border-bottom: 1px solid rgba(250, 204, 21, 0.4);
    }

    .drawer-header {
        font-family: var(--font-mono);
        font-size: 0.6rem;
        font-weight: bold;
        color: var(--color-primary);
        letter-spacing: 0.05em;
        opacity: 1;
        text-transform: uppercase;
        padding-left: 16px;
    }
    .drawer-header::before {
        content: ">_ ";
        opacity: 0.5;
    }

    .drawer-sub {
        font-family: var(--font-mono);
        font-size: 0.35rem;
        color: #555;
        padding-left: 16px;
        margin-top: -4px;
        margin-bottom: 2px;
    }

    .chips-container {
        display: flex;
        gap: 8px;
        width: 100%;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 0 16px;
        box-sizing: border-box;

        mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--mask-left),
            black calc(100% - var(--mask-right)),
            transparent 100%
        );
        -webkit-mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--mask-left),
            black calc(100% - var(--mask-right)),
            transparent 100%
        );
    }

    .chips-container::-webkit-scrollbar {
        display: none;
    }

    .version-chip {
        height: 22px;
        padding: 0 8px;
        flex-shrink: 0;
        border-radius: 0px;
        background: #111;
        border: 1px solid #333;
        display: flex;
        align-items: center;
        font-family: var(--font-mono);
        font-size: 0.55rem;
        color: #888;
        cursor: pointer;
        transition: all 0.1s ease;
        white-space: nowrap;
    }

    .version-chip:hover {
        background: #222;
        color: #fff;
        border-color: #555;
    }

    .version-chip.current {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #000;
        font-weight: 700;
    }

    .filter-check {
        margin-right: 6px;
        opacity: 0.5;
        font-weight: 400;
    }

    .filter-chip.cursor-active {
        border-color: #fff;
        background: #222;
        color: #fff;
    }

    .filter-chip.selected {
        background: rgba(250, 204, 21, 0.15);
        color: var(--color-primary);
        border-color: rgba(250, 204, 21, 0.5);
    }

    .filter-chip.cursor-active.selected {
        background: var(--color-primary);
        color: #000;
        border-color: var(--color-primary);
    }
    .filter-chip.cursor-active.selected .filter-check {
        opacity: 1;
        color: #000;
    }

    .no-filters {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        color: #aaa;
        padding: 4px 0;
        font-weight: bold;
    }

    .top-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        margin-bottom: auto;
        padding: 0 16px;
        box-sizing: border-box;
    }

    .content-stage {
        flex: 1;
        display: grid;
        grid-template-areas: "stack";
        align-items: end;
        overflow: hidden;
        width: 100%;
        transform: translateX(var(--slide-offset, 0px));
    }

    .slide-container {
        grid-area: stack;
        width: 100%;
    }

    .bottom-section {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 0 16px;
        box-sizing: border-box;
    }

    .pagination-wrapper {
        position: relative;
        width: 100%;
        max-width: 300px;
        margin-bottom: 16px;
        margin-top: 16px;
        overflow: visible;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: -40px;
        margin-bottom: -40px;
    }

    .pagination-scroll {
        padding-top: 50px;
        padding-bottom: 50px;
        padding-left: 14px;
        padding-right: 14px;

        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        overflow-y: visible;
        scrollbar-width: none;
        width: fit-content;

        box-sizing: border-box;
        mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--mask-left),
            black calc(100% - var(--mask-right)),
            transparent 100%
        );
        -webkit-mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--mask-left),
            black calc(100% - var(--mask-right)),
            transparent 100%
        );
    }

    .pagination-scroll::-webkit-scrollbar {
        display: none;
    }

    .pagination-counter {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        font-family: var(--font-mono);
        font-size: 0.5rem;
        color: #fff;
        font-weight: bold;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 10;
        text-shadow: 0 0 4px #000;
    }

    .pagination-counter.visible {
        opacity: 1;
    }

    .pagination-counter.left {
        left: 0;
    }
    .pagination-counter.right {
        right: 0;
    }

    .dot {
        width: 3px;
        height: 3px;
        flex-shrink: 0;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.75);
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

    .tag-hash {
        color: var(--color-primary);
        margin-right: 4px;
        opacity: 0.4;
        font-size: 0.9em;
    }

    .header-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .meta-line {
        font-family: var(--font-mono);
        font-size: 0.45rem;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 1);
        display: flex;
        gap: 4px;
        align-items: center;
    }
    .meta-slash {
        color: white;
        opacity: 1;
        font-weight: bold;
    }
    .meta-ver {
        opacity: 1;
        transition: opacity 0.2s;
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

    .game-title,
    .game-desc,
    .meta-line,
    .data-entry,
    .grid-label {
        text-shadow:
            0 0px 2px rgba(0, 0, 0, 1),
            0 0px 4px rgba(0, 0, 0, 1),
            0 0px 2px rgba(0, 0, 0, 1),
            0 0px 4px rgba(0, 0, 0, 1),
            0 0px 2px rgba(0, 0, 0, 1),
            0 0px 4px rgba(0, 0, 0, 1);
    }

    .game-desc {
        margin: 0;
        margin-top: 4px;
        font-size: 0.65rem;
        color: var(--color-text-secondary);
        line-height: 1.3;
        max-width: 85%;
    }

    .data-grid {
        display: flex;
        flex-direction: column;
    }

    .grid-row {
        display: grid;
        grid-template-columns: 40px 1fr;
        align-items: baseline;
        padding-top: 6px;
        font-weight: 800;
    }

    .grid-row:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .grid-label {
        font-family: var(--font-mono);
        font-size: 0.45rem;
        color: var(--color-primary);
        letter-spacing: 0.05em;
        opacity: 0.9;
        padding-top: 1px;
    }
    .grid-content {
        display: flex;
        flex-wrap: wrap;
        gap: 0px 12px;
    }

    .data-entry {
        font-family: var(--font-mono);
        font-size: 0.5rem;
        display: flex;
        align-items: center;
        gap: 2px;
        color: rgba(255, 255, 255, 0.85);
    }

    .filter-hud-static {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;

        background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.5) 3px
        );

        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .hud-inner {
        padding: 8px 0;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .hud-icon {
        font-family: var(--font-mono);
        font-size: 0.4rem;
        color: var(--color-primary);
        background: rgba(250, 204, 21, 0.1);
        border: 1px solid rgba(250, 204, 21, 0.3);
        padding: 2px 6px;
        letter-spacing: 0.05em;
        font-weight: 700;
    }

    .hud-msg {
        font-family: var(--font-mono);
        font-size: 0.4rem;
        color: #888;
        text-transform: uppercase;
    }

    .hud-msg::after {
        content: "_";
        animation: blink 1s step-end infinite;
        color: var(--color-primary);
        margin-left: 4px;
    }

    .key {
        color: #fff;
    }

    @keyframes blink {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0;
        }
    }

    :global(.fireworks) {
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        position: absolute;
        pointer-events: none;
        z-index: 100;
    }
    .overlay-backdrop {
        position: absolute;
        inset: 0;
        z-index: 999;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* --- MINI LOADER --- */
    .mini-loader {
        display: flex;
        align-items: center;
        gap: 12px; /* Horizontal layout saves vertical space */
        padding: 10px 20px;
        border: 1px solid rgba(250, 204, 21, 0.3);
        background: rgba(0, 0, 0, 0.8);
        box-shadow: 0 0 10px rgba(250, 204, 21, 0.1);
    }

    .loader-spinner-mini {
        width: 24px;
        height: 24px;
        border: 2px solid rgba(250, 204, 21, 0.2);
        border-top-color: var(--color-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    .loader-content-mini {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .loader-label {
        font-family: var(--font-mono);
        color: var(--color-primary);
        font-size: 0.6rem; /* Small readable text */
        letter-spacing: 0.05em;
        text-shadow: 0 0 5px var(--color-primary);
        font-weight: bold;
    }

    .loader-bar-mini {
        width: 100px;
        height: 3px;
        background: rgba(255, 255, 255, 0.15);
        overflow: hidden;
    }

    .loader-progress-mini {
        width: 100%;
        height: 100%;
        background: var(--color-primary);
        transform: translateX(-100%);
        animation: loadProgress 1.5s ease-in-out infinite;
    }

    /* --- MINI ERROR SCREEN --- */
    .overlay-backdrop.error-mode {
        background: rgba(20, 0, 0, 0.95);
        backdrop-filter: blur(2px);
    }

    .mini-error-box {
        width: 280px; /* Fits comfortably inside 363px */
        border: 1px solid var(--color-error);
        background: #050000;
        box-shadow: 0 0 15px rgba(255, 51, 51, 0.2);
        display: flex;
        flex-direction: column;
    }

    .mini-err-header {
        background: var(--color-error);
        color: #000;
        font-family: var(--font-mono);
        font-weight: 800;
        font-size: 0.55rem;
        padding: 2px 6px;
        letter-spacing: 0.05em;
    }

    .mini-err-body {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .mini-err-msg {
        font-family: var(--font-display);
        color: #fff;
        font-size: 0.9rem; /* Main text size */
        line-height: 1.1;
        margin: 0;
        text-transform: uppercase;
        border-left: 2px solid rgba(255, 51, 51, 0.5);
        padding-left: 8px;
        word-break: break-word; /* Prevent overflow */
    }

    .mini-err-meta {
        font-family: var(--font-mono);
        font-size: 0.45rem;
        color: var(--color-error);
        opacity: 0.8;
        border-top: 1px dashed rgba(255, 51, 51, 0.3);
        padding-top: 4px;
    }

    .mini-err-footer {
        padding: 4px 8px;
        background: rgba(255, 51, 51, 0.1);
        border-top: 1px solid rgba(255, 51, 51, 0.2);
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 4px;
    }

    .key-badge {
        background: #fff;
        color: #000;
        font-family: var(--font-mono);
        font-size: 0.5rem;
        font-weight: bold;
        padding: 0px 4px;
        border-radius: 2px;
        line-height: 1.2;
    }

    .key-label {
        font-family: var(--font-mono);
        font-size: 0.5rem;
        color: var(--color-error);
        font-weight: bold;
    }

    /* --- ANIMATIONS --- */
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    @keyframes loadProgress {
        0% {
            transform: translateX(-100%);
        }
        50% {
            transform: translateX(0%);
        }
        100% {
            transform: translateX(100%);
        }
    }
</style>
