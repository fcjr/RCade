import { Client, Game, generateTotp, TOTP_PARAMS } from "@rcade/api";
import { type PluginEnvironment, type Plugin } from "@rcade/sdk-plugin";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { SETTINGS } from "./settings";
import type { QuitOptions } from "@rcade/sdk";

const cabinetApiKey = process.env.CABINET_API_KEY;
const apiClient = cabinetApiKey ? Client.newKeyed(cabinetApiKey) : Client.new();
if (process.env.RCADE_API_URL) {
    apiClient.withBaseUrl(process.env.RCADE_API_URL);
}
const cacheDir = path.join(app.getPath('userData'), 'game-cache');
const gamesListCachePath = path.join(app.getPath('userData'), 'games-list.json');

async function saveGamesListCache(games: {}[]): Promise<void> {
    await fs.writeFile(gamesListCachePath, JSON.stringify(games, null, 2));
}

function getCachePath(gameId: string, version: string): string {
    return path.join(cacheDir, gameId, version);
}

const EVENT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_WARN_MS = 10_000;

type CachedEvent = {
    id: string;
    name: string;
    startsAtMs: number;
    endsAtMs: number;
    totpSecret: string;
};

type EventCodeStatus = {
    active: boolean;
    name?: string;
    code?: string;
};

type GameInfo = {
    id: string;
    name: string;
    displayName: string | null;
    latestVersion: string | undefined;
    authors: { display_name: string }[];
    dependencies: any[];
    contentUrl?: string;
    permissions: any[];
    apiResponse?: any;
}

async function loadGamesListCache(): Promise<GameInfo[] | null> {
    try {
        const data = await fs.readFile(gamesListCachePath, 'utf-8');
        return JSON.parse(data) as GameInfo[];
    } catch {
        return null;
    }
}

async function isGameCached(gameId: string, version: string): Promise<boolean> {
    const gamePath = getCachePath(gameId, version);
    return existsSync(gamePath);
}

export default class MenuPlugin implements Plugin {
    private currentEvent: CachedEvent | null = null;
    private eventRefreshTimer: ReturnType<typeof setInterval> | undefined;
    private codePushTimer: ReturnType<typeof setTimeout> | undefined;

    start(environment: PluginEnvironment): void {
        SETTINGS.load();

        const port = environment.getPort();

        console.log(`[@rcade/menu] Menu plugin started, listening for messages on port`);

        port.on("message", event => {
            const { type, nonce, content } = event.data;

            console.log(`[@rcade/menu] Received message of type: ${type} (nonce: ${nonce})`);

            if (type === "get-games") {
                console.log(`[@rcade/menu] Received get-games request (nonce: ${nonce})`);

                this.getGames().then(games => {
                    console.log(`[@rcade/menu] Returning ${games.length} games to menu`);

                    port.postMessage({ type: "games-response", nonce, content: games });
                }).catch(error => {
                    port.postMessage({ type: "games-error", nonce, content: error.message });
                });
                return;
            }

            if (type === "play-game") {
                const { game, version } = content;
                this.play(environment.getWebContents(), game, version);
                return;
            }

            if (type === "get-last-game") {
                port.postMessage({ type: "last-game", nonce, content: { lastGameId: SETTINGS.lastGameId } });
                return;
            }

            if (type === "get-event-code") {
                this.eventCodeStatus().then(content => {
                    port.postMessage({ type: "event-code", nonce, content });
                });
                return;
            }
        });

        // @ts-ignore
        environment.getWebContents().addListener("game-unloaded", (options: QuitOptions) => {
            port.postMessage({ type: "quit_game", options });
        });

        // @ts-ignore
        environment.getWebContents().addListener("game-load-finished", (result) => {
            port.postMessage({ type: "game_load_finished", result });
        });

        // @ts-ignore
        environment.getWebContents().addListener("menu-requested", () => {
            port.postMessage({ type: "menu_requested" });
        });

        port.start();

        // The cabinet is the clock for event codes: fetch the event (incl. TOTP
        // secret) from the API, then mint display codes locally so a network
        // blip doesn't blank the code on screen. The menu iframe only ever
        // receives the derived code, never the secret.
        this.refreshEvent().then(() => this.scheduleCodePushes(port));
        this.eventRefreshTimer = setInterval(() => this.refreshEvent(), EVENT_REFRESH_INTERVAL_MS);
    }

    stop(): void {
        console.log(`[@rcade/menu] Menu plugin stopped`);

        clearInterval(this.eventRefreshTimer);
        clearTimeout(this.codePushTimer);
    }

    private async refreshEvent(): Promise<void> {
        try {
            const response = await apiClient.getCurrentEvent();

            const skewMs = response.server_time - Date.now();
            if (Math.abs(skewMs) > CLOCK_SKEW_WARN_MS) {
                console.error(`[@rcade/menu] Cabinet clock differs from server by ${Math.round(skewMs / 1000)}s — event codes may fail to verify. Check NTP.`);
            }

            if (response.active) {
                this.currentEvent = {
                    id: response.event.id,
                    name: response.event.name,
                    startsAtMs: Date.parse(response.event.starts_at),
                    endsAtMs: Date.parse(response.event.ends_at),
                    totpSecret: response.event.totp_secret,
                };
            } else {
                this.currentEvent = null;
            }
        } catch (err) {
            // offline: keep the cached event and keep minting codes until it ends
            console.log('[@rcade/menu] Failed to refresh current event, keeping cached state:', err);
        }
    }

    private async eventCodeStatus(): Promise<EventCodeStatus> {
        const event = this.currentEvent;
        const now = Date.now();

        if (!event || now < event.startsAtMs || now > event.endsAtMs) {
            return { active: false };
        }

        return {
            active: true,
            name: event.name,
            code: await generateTotp(event.totpSecret, now),
        };
    }

    private scheduleCodePushes(port: ReturnType<PluginEnvironment["getPort"]>): void {
        const push = async () => {
            port.postMessage({ type: "event_code", content: await this.eventCodeStatus() });

            const stepMs = TOTP_PARAMS.periodSeconds * 1000;
            // wake just past the next code rotation boundary
            this.codePushTimer = setTimeout(push, stepMs - (Date.now() % stepMs) + 50);
        };

        push();
    }

    private async getGames(): Promise<any[]> {
        try {
            const games = (await apiClient.getAllGames())
                .filter((game) => game.name() !== 'menu');

            const gameInfos = games.map((game: Game) => ({
                id: game.id(),
                name: game.name(),
                displayName: game.latest().displayName(),
                latestVersion: game.latest().version(),
                contentUrl: game.latest().contentUrl(),
                authors: game.latest().authors().map(a => ({ display_name: a.display_name })),
                dependencies: game.latest().dependencies(),
                permissions: game.latest().permissions(),
                apiResponse: game.intoApiResponse(),
            }));

            // cache the game list for offline use
            await saveGamesListCache(gameInfos);

            return games.map((game: Game) => game.intoApiResponse());
        } catch (err) {
            // if api fails (offline), try to load from cache
            console.log('[@rcade/menu] API fetch failed, trying cached list:', err);
            const cachedGames = await loadGamesListCache();

            if (!cachedGames) {
                throw err;
            }

            const downloadedGames = await Promise.all(
                cachedGames.map(async (game) => {
                    if (game.id && game.latestVersion && await isGameCached(game.id, game.latestVersion)) {
                        return game;
                    }
                    return null;
                })
            );

            const availableGames = downloadedGames.filter((g): g is GameInfo => g !== null);
            console.log(`[Games] Loaded ${availableGames.length} downloaded games from cache (${cachedGames.length} total cached)`);

            return availableGames.map((game: GameInfo) => game.apiResponse!);
        }
    }

    private play(wc: Electron.WebContents, gameResponse: any, version: string): void {
        const game = Game.fromApiResponse(gameResponse);

        console.log(`Playing game ${game.id()} version ${version}`);

        SETTINGS.update(settings => {
            settings.lastGameId = game.id();
        });

        const gameInfo: GameInfo = {
            id: game.id(),
            name: game.name(),
            displayName: game.latest().displayName() ?? null,
            latestVersion: game.latest().version(),
            contentUrl: game.latest().contentUrl(),
            authors: game.latest().authors().map(a => ({ display_name: a.display_name })),
            dependencies: game.latest().dependencies(),
            permissions: game.latest().permissions(),
            apiResponse: game.intoApiResponse(),
        }

        wc.send('route-move', { page: 'game', game: gameInfo });
    }
}
