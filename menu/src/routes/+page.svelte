<script lang="ts">
    import BackgroundOverlay from "$lib/components/BackgroundOverlay.svelte";
    import { fly, slide } from "svelte/transition";
    import {
        getEventCode,
        getGames,
        getLastGame,
        onEventCode,
        onGameLoad,
        onGameQuit,
        onMenuRequested,
        playGame,
        type EventCodeStatus,
    } from "@rcade/plugin-menu";
    import { quartOut } from "svelte/easing";
    import { tick, onMount } from "svelte";
    import { Game } from "@rcade/api";
    import { on as onInput } from "@rcade/plugin-input-classic";
    import { Curve, Curves, P1, P2 } from "@rcade/plugin-input-spinners";
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

    function randomGameIndex() {
        return Math.floor(Math.random() * sortedGames.length);
    }

    async function refreshGames(randomize: boolean) {
        const currentGameId = currentGame?.id();
        const loadedGames = await loadGames();
        games = loadedGames;

        await tick();

        if (randomize && sortedGames.length > 0) {
            setPage(randomGameIndex());
        } else if (currentGameId && loadedGames.length > 0) {
            // Try to stay on the same game after refresh
            const index = sortedGames.findIndex(
                (game) => game.id() === currentGameId,
            );
            if (index !== -1) {
                setPage(index);
            }
        }

        updateVersionMasks();
    }

    let screensaverActive = false;

    SCREENSAVER.addEventListener("started", () => {
        viewportState = "neutral";
        screensaverActive = true;
        // Motor off while nobody's here.
        if (!gameHasKnobs()) P1.reset().catch(() => {});
    });

    SCREENSAVER.addEventListener("stopped", () => {
        screensaverActive = false;
        resetKnob();
    });

    const DEGREES_PER_GAME = 30;
    // Walls are sent once within this many games: further than anyone turns
    // while new curves are in flight.
    const WALL_REACH = 20;
    const knobFeel = { mass: 0, tension: 0.08, friction: 0.1 };
    const LETTER_TENSION = 0.22;

    function wallsAt(page: number, count: number) {
        const last = Math.max(0, count - 1);
        return { left: page <= WALL_REACH, right: last - page <= WALL_REACH, last };
    }

    // The hill into each letter is harder to climb, from either side.
    function letterTension(starts: number[]): Curve {
        const base = knobFeel.tension;
        const spans: [number, number][] = [];
        for (const start of starts) {
            const from = (start - 1) * DEGREES_PER_GAME;
            const previous = spans.at(-1);
            if (previous && previous[1] === from) previous[1] = from + DEGREES_PER_GAME;
            else spans.push([from, from + DEGREES_PER_GAME]);
        }
        if (spans.length === 0) return Curve.uniform(base);
        return Curve.points([
            { x: -Infinity, y: base },
            ...spans.flatMap(([from, to]) => [
                { x: from, y: base },
                { x: from, y: LETTER_TENSION },
                { x: to, y: LETTER_TENSION },
                { x: to, y: base },
            ]),
            { x: Infinity, y: base },
        ]);
    }

    // Both walls near means a short list: every game fits on the wire.
    function menuCurves({ left, right, last }: ReturnType<typeof wallsAt>, starts: number[]): Curves {
        const games = last + 1;
        const detents = left && right
            ? Curve.steps(games, { angle: [0, games * DEGREES_PER_GAME] })
            : Curve.steps(1, { angle: [0, DEGREES_PER_GAME] });
        let curves = Curves.target(detents)
            .tension(letterTension(starts))
            .mass(knobFeel.mass)
            .friction(knobFeel.friction);
        if (left) curves = curves.wall("left", { angle: 0 });
        if (right) curves = curves.wall("right", { angle: last * DEGREES_PER_GAME });
        return curves;
    }

    let knobPage = -1;
    let knobWalls = "";

    function sendCurves() {
        if (knobsIdle()) return;
        const walls = wallsAt(activePage, totalPages);
        // Undefined until its reactive statement first runs.
        const starts = (letterGroups ?? []).map((group) => group.start).filter((start) => start > 0);
        const key = JSON.stringify({ walls, starts });
        if (key === knobWalls) return;
        knobWalls = key;
        P1.setCurves(menuCurves(walls, starts)).catch(() => {
            knobWalls = "";
        });
    }

    function placeKnob() {
        if (knobsIdle()) return;
        knobPage = activePage;
        sendCurves();
        P1.tare(activePage * DEGREES_PER_GAME).catch(() => {});
    }

    $: if (activePage !== knobPage) placeKnob();
    $: totalPages, letterGroups, sendCurves();

    P1.subscribe((event) => {
        if (knobsIdle()) return;
        moveEvents.emit("drag", event.deltaAngle / DEGREES_PER_GAME);
        if (viewportState !== "neutral" || totalPages === 0) return;
        const page = Math.max(0, Math.min(totalPages - 1, Math.round(event.globalAngle / DEGREES_PER_GAME)));
        if (page !== activePage) {
            knobPage = page;
            setPage(page);
            sendCurves();
            play_menu_move();
        }
    });

    function resetKnob() {
        knobWalls = "";
        placeKnob();
    }

    let knobConnected = false;
    function watchKnob() {
        if (P1.connected && !knobConnected) resetKnob();
        knobConnected = P1.connected;
        requestAnimationFrame(watchKnob);
    }
    requestAnimationFrame(watchKnob);

    // P2 jumps letter groups: 10 of the old spinner's 64 steps per turn.
    const DEGREES_PER_LETTER = (10 * 360) / 64;
    const LETTER_IDLE_MS = 500;
    let letterTurned = 0;
    let letterIdle: ReturnType<typeof setTimeout> | undefined;

    P2.subscribe((event) => {
        if (knobsIdle() || viewportState !== "neutral") return;
        letterTurned += event.deltaAngle;
        clearTimeout(letterIdle);
        letterIdle = setTimeout(() => (letterTurned = 0), LETTER_IDLE_MS);
        while (Math.abs(letterTurned) >= DEGREES_PER_LETTER) {
            const step = Math.sign(letterTurned);
            letterTurned -= step * DEGREES_PER_LETTER;
            jumpLetter(step);
        }
    });

    let games: Game[] = [];
    let loading = true;

    // Rotating event code, minted by the cabinet and pushed over the plugin
    // channel while an event is active.
    let eventStatus: EventCodeStatus = { active: false };

    onMount(() => {
        // Register input handlers
        const unsubPress = registerPressHandler();
        const unsubInputEnd = registerInputEndHandler();

        // Subscribe to menu key to refresh games list. This also fires when
        // exiting a game (before the quit arrives), so only jump to a random
        // game when the menu itself was already showing.
        onMenuRequested(() => {
            refreshGames(!gameActive && !gameLoading);
        });

        // Event code: pull current state now, then follow rotation pushes
        onEventCode((status) => {
            eventStatus = status;
        });
        getEventCode().then((status) => {
            eventStatus = status;
        });

        preloadMenuSound();

        // Load games
        loadGames().then((loadedGames) => {
            games = loadedGames;

            tick().then(() => {
                updateVersionMasks();

                if (games.length > 0) {
                    getLastGame().then((id) => {
                        let index = sortedGames.findIndex(
                            (game) => game.id() == id,
                        );

                        // Start on a random game when there's no last game
                        if (index == -1) index = randomGameIndex();
                        setPage(index);

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

    $: sortedGames = [...games].sort((a, b) =>
        (a.latest().displayName() ?? a.name()).localeCompare(
            b.latest().displayName() ?? b.name(),
        ),
    );

    $: totalPages = sortedGames.length;

    // --- LETTER GROUPS ---
    type LetterGroup = { letter: string; start: number; count: number };

    function letterOf(game: Game) {
        const c = (game.latest().displayName() || game.name())
            .trim()
            .charAt(0)
            .toUpperCase();
        return c >= "A" && c <= "Z" ? c : "#";
    }

    $: letterGroups = sortedGames.reduce<LetterGroup[]>((groups, game, i) => {
        const letter = letterOf(game);
        const last = groups[groups.length - 1];
        if (last && last.letter === letter) last.count++;
        else groups.push({ letter, start: i, count: 1 });
        return groups;
    }, []);

    $: activeGroupIndex = letterGroups.findIndex(
        (g) => activePage >= g.start && activePage < g.start + g.count,
    );

    function jumpLetter(step: number) {
        const target = letterGroups[activeGroupIndex + step];
        if (!target) return;
        setPage(target.start);
        moveEvents.emit("move", step < 0);
    }

    // Pagination strip geometry (px). Widths are computed here rather than
    // measured so box widths and track offsets transition in lockstep.
    const DOT_PITCH = 13;
    const MAX_DOTS = 15;
    const BOX_COLLAPSED = 22;
    const BOX_GAP = 6;
    const COUNTER_W = 36;
    const STRIP_W = 300;
    const STRIP_FADE = 16; // Fade sits outside the strip's edges

    $: groupLayout = letterGroups.map((g, gi) => {
        const active = gi === activeGroupIndex;
        const overflow = g.count > MAX_DOTS;
        const windowW = Math.min(g.count, MAX_DOTS) * DOT_PITCH;
        const local = activePage - g.start;
        const firstVisible = overflow
            ? Math.max(0, Math.min(g.count - MAX_DOTS, local - (MAX_DOTS >> 1)))
            : 0;
        const expandedW = (overflow ? COUNTER_W * 2 : 0) + windowW + 6;
        return {
            ...g,
            active,
            overflow,
            windowW,
            local,
            dotsOffset: -firstVisible * DOT_PITCH,
            hiddenLeft: firstVisible,
            hiddenRight: overflow ? g.count - MAX_DOTS - firstVisible : 0,
            width: BOX_COLLAPSED + (active ? expandedW : 0),
        };
    });

    // Keep the active letter box centered in the strip
    $: stripOffset = (() => {
        let x = 0;
        for (const g of groupLayout) {
            if (g.active) return STRIP_FADE + STRIP_W / 2 - (x + g.width / 2);
            x += g.width + BOX_GAP;
        }
        return 0;
    })();

    // --- NAVIGATION STATE ---
    let activePage = 0;
    let activeVersionIndex = 0;
    let direction = 1;
    let viewportState: "neutral" | "show-bottom" = "neutral";
    let gameActive = false;
    SCREENSAVER.updateScreensaver({ transparent: true });

    let versionsContainer: HTMLDivElement;

    // Mask Variables
    let maskLeftSize = "0px";
    let maskRightSize = "0px";

    $: currentGame = sortedGames[activePage];
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

    // --- SCROLL UTILS ---
    function updateVersionMasks() {
        if (!versionsContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = versionsContainer;
        maskLeftSize = scrollLeft > 10 ? "20px" : "0px";
        maskRightSize =
            scrollWidth - clientWidth - scrollLeft > 10 ? "20px" : "0px";
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

    let gameLoading = false;

    function gameHasKnobs() {
        return gameActive || gameLoading;
    }

    function knobsIdle() {
        return gameHasKnobs() || screensaverActive;
    }
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
        resetKnob();
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

            // Version drawer open/close (disabled)
            // if (e.button === "DOWN" && e.player == 1) {
            //     if (currentGame) {
            //         viewportState = "show-bottom";
            //         tick().then(() =>
            //             triggerScroll(
            //                 versionsContainer,
            //                 activeVersionIndex,
            //                 true,
            //                 updateVersionMasks,
            //             ),
            //         );
            //     }
            // } else if (e.button === "UP" && e.player == 1) {
            //     viewportState = "neutral";
            // }

            if (e.player == 1 && viewportState === "neutral") {
                if (e.button === "UP") jumpLetter(-1);
                else if (e.button === "DOWN") jumpLetter(1);
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
                if (currentGame && currentVersion) {
                    startGame(
                        currentGame.intoApiResponse(),
                        currentVersion.version(),
                    );
                }
            }

            if (
                e.button === "B" &&
                e.player == 1 &&
                viewportState === "neutral"
            ) {
                if (currentGame && currentVersion) {
                    startGame(
                        currentGame.intoApiResponse(),
                        currentVersion.version(),
                    );
                }
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
    on:resize={updateVersionMasks}
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
        class:show-bottom={viewportState === "show-bottom"}
        style:--tilt-x="{tiltX}deg"
        style:--tilt-y="{tiltY}deg"
    >
        <div class="bg-layer">
            <BackgroundOverlay
                events={moveEvents}
                progress={totalPages > 1 ? activePage / (totalPages - 1) : 0}
            />
        </div>

        <div class="ui-layer" class:screensaver={screensaverActive}>
            {#if loading}
                <div class="empty-state">
                    <span>LOADING_GAMES...</span>
                </div>
            {/if}
            {#if !loading && currentGame && currentVersion}
                <div class="top-section">
                    <div
                        class="pagination-strip"
                        style:width="{STRIP_W + 2 * STRIP_FADE}px"
                        style:--strip-fade="{STRIP_FADE}px"
                    >
                        <div
                            class="pagination-track"
                            style:transform="translateX({stripOffset}px)"
                            style:gap="{BOX_GAP}px"
                        >
                            {#each groupLayout as group (group.letter + group.start)}
                                <div
                                    class="letter-box"
                                    class:active={group.active}
                                    style:width="{group.width}px"
                                    on:click={() => setPage(group.start)}
                                    role="button"
                                    tabindex="0"
                                >
                                    <span
                                        class="letter-label"
                                        style:width="{BOX_COLLAPSED - 2}px"
                                        >{group.letter}</span
                                    >
                                    <div class="letter-body">
                                        {#if group.overflow}
                                            <span
                                                class="letter-counter"
                                                class:visible={group.hiddenLeft > 0}
                                                style:width="{COUNTER_W}px"
                                                >(+{group.hiddenLeft})</span
                                            >
                                        {/if}
                                        <div
                                            class="dot-window"
                                            class:fade-left={group.hiddenLeft > 0}
                                            class:fade-right={group.hiddenRight > 0}
                                            style:width="{group.windowW}px"
                                        >
                                            <div
                                                class="dot-track"
                                                style:transform="translateX({group.dotsOffset}px)"
                                            >
                                                {#each Array(group.count) as _, i}
                                                    <div
                                                        class="dot-slot"
                                                        style:width="{DOT_PITCH}px"
                                                        on:click|stopPropagation={() =>
                                                            setPage(group.start + i)}
                                                        role="button"
                                                        tabindex="0"
                                                    >
                                                        <div
                                                            class="dot"
                                                            class:active={group.active &&
                                                                i === group.local}
                                                        ></div>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                        {#if group.overflow}
                                            <span
                                                class="letter-counter"
                                                class:visible={group.hiddenRight > 0}
                                                style:width="{COUNTER_W}px"
                                                >(+{group.hiddenRight})</span
                                            >
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>

                    {#if eventStatus.active}
                        <div class="event-line">
                            <span>{eventStatus.name} Event Code</span>
                            <span class="event-line-dot">·</span>
                            <span class="event-line-code">{eventStatus.code}</span>
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

    .bg-layer {
        position: absolute;
        inset: 0;
        z-index: 0;
        opacity: 1;
        transition:
            filter 0.3s var(--ease-snappy),
            opacity 0.3s var(--ease-snappy);
    }

    .shifting-viewport.show-bottom .bg-layer {
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

    .shifting-viewport.show-bottom .ui-layer {
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
    .version-drawer {
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

    .drawer-header {
        font-family: var(--font-mono);
        font-size: 0.75rem;
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
        overflow: hidden;
        width: 100%;
    }

    .slide-container {
        grid-area: stack;
        width: 100%;
        min-height: 0;
        display: flex;
    }

    .bottom-section {
        flex: 1;
        width: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
        /* Inset to line up with the edges of the letter strip */
        padding: 10px 18px 0;
        box-sizing: border-box;
    }

    .pagination-strip {
        position: relative;
        flex-shrink: 0;
        margin-top: 10px;
        margin-bottom: 6px;
        padding: 8px 0;
        overflow: hidden;
        mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--strip-fade),
            black calc(100% - var(--strip-fade)),
            transparent 100%
        );
        -webkit-mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--strip-fade),
            black calc(100% - var(--strip-fade)),
            transparent 100%
        );
    }

    .pagination-track {
        display: flex;
        align-items: center;
        width: max-content;
        transition: transform 0.3s var(--ease-snappy);
    }

    .letter-box {
        height: 20px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        box-sizing: border-box;
        overflow-x: clip;
        overflow-y: visible;
        border: 1px solid rgba(255, 255, 255, 0.35);
        background: rgba(0, 0, 0, 0.4);
        cursor: pointer;
        transition:
            width 0.3s var(--ease-snappy),
            border-color 0.3s var(--ease-snappy);
    }

    .letter-box.active {
        border-color: var(--color-primary);
    }

    .letter-label {
        flex-shrink: 0;
        text-align: center;
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: bold;
        line-height: 1;
        color: rgba(255, 255, 255, 0.6);
        transition: color 0.3s var(--ease-snappy);
    }

    .letter-box.active .letter-label {
        color: var(--color-primary);
    }

    .letter-body {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        padding-right: 6px;
        opacity: 0;
        transition: opacity 0.3s var(--ease-snappy);
    }

    .letter-box.active .letter-body {
        opacity: 1;
    }

    .letter-counter {
        flex-shrink: 0;
        text-align: center;
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: bold;
        line-height: 1;
        color: #fff;
        opacity: 0;
        transition: opacity 0.2s ease;
    }

    .letter-counter.visible {
        opacity: 0.8;
    }

    .dot-window {
        /* room for the active dot's glow inside the mask */
        --pad: 8px;
        --fade-l: 0px;
        --fade-r: 0px;
        flex-shrink: 0;
        overflow-x: clip;
        overflow-y: visible;
        box-sizing: content-box;
        padding: var(--pad);
        margin: calc(-1 * var(--pad));
        mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--fade-l),
            black calc(100% - var(--fade-r)),
            transparent 100%
        );
        -webkit-mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--fade-l),
            black calc(100% - var(--fade-r)),
            transparent 100%
        );
    }

    .dot-window.fade-left {
        --fade-l: calc(var(--pad) + 39px);
    }

    .dot-window.fade-right {
        --fade-r: calc(var(--pad) + 39px);
    }

    .dot-track {
        display: flex;
        width: max-content;
        transition: transform 0.3s var(--ease-snappy);
    }

    .dot-slot {
        height: 16px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .event-line {
        margin-top: -4px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono);
        color: var(--color-primary);
        font-size: 12px;
        letter-spacing: 0.1em;
    }

    .event-line-dot {
        opacity: 0.5;
    }

    .event-line-code {
        font-weight: bold;
        letter-spacing: 0.2em;
    }

    .dot {
        width: 4.5px;
        height: 4.5px;
        flex-shrink: 0;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.75);
        transition: all 0.3s var(--ease-snappy);
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

    .header-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
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
        /* Tall enough that descenders on wrapped lines clear the next line */
        line-height: 1.05;
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
        margin-top: 2px;
        font-size: 0.65rem;
        color: var(--color-text-secondary);
        line-height: 1.3;
        max-width: 85%;
    }

    .data-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .grid-row {
        display: grid;
        grid-template-columns: 40px 1fr;
        align-items: baseline;
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
