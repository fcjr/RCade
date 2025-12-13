import { Client, Game } from "@rcade/api";
import { type PluginEnvironment, type Plugin } from "@rcade/sdk-plugin";
import { app, type MessagePortMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const cabinetApiKey = process.env.CABINET_API_KEY;
const apiClient = cabinetApiKey ? Client.newKeyed(cabinetApiKey) : Client.new();
const cacheDir = path.join(app.getPath('userData'), 'game-cache');
const gamesListCachePath = path.join(app.getPath('userData'), 'games-list.json');

async function saveGamesListCache(games: {}[]): Promise<void> {
    await fs.writeFile(gamesListCachePath, JSON.stringify(games, null, 2));
}

function getCachePath(gameId: string, version: string): string {
    return path.join(cacheDir, gameId, version);
}

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
    start(environment: PluginEnvironment): void {
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
        })

        port.start();
    }

    stop(): void {
        console.log(`[@rcade/menu] Menu plugin stopped`);
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