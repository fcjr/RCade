import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import net from 'net';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Client, Game } from '@rcade/api';
import * as tar from 'tar';
import type { GameInfo, LoadGameResult } from '../shared/types';
import { rcadeInputClassic } from '../plugins/rcade-input-classic/index.js';
import { parseCliArgs } from "./args.js";

const args = parseCliArgs();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged || args.dev;

// Scale factor of 2 is the largest reasonable size for a normal macbook screen
// and should stay the default for development.
const scaleFactor = args.scale ?? (isDev ? 2 : 1);

app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

// Hide cursor on Linux
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('cursor', 'none');
}

const apiClient = Client.new();

// Cache directory for game files
const cacheDir = path.join(app.getPath('userData'), 'game-cache');

// Track running game servers
const gameServers = new Map<string, { server?: ReturnType<typeof serve>; url: string; controller: AbortController }>();

function getCachePath(gameId: string, version: string): string {
  return path.join(cacheDir, gameId, version);
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
}

async function isGameCached(gameId: string, version: string): Promise<boolean> {
  const gamePath = getCachePath(gameId, version);
  return existsSync(gamePath);
}

async function downloadAndExtract(contentUrl: string, gameId: string, version: string): Promise<void> {
  const gamePath = getCachePath(gameId, version);
  await fs.mkdir(gamePath, { recursive: true });

  const response = await fetch(contentUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download game: ${response.statusText}`);
  }

  const tarPath = path.join(gamePath, 'game.tar.gz');
  const fileStream = createWriteStream(tarPath);

  // @ts-ignore - ReadableStream compatibility
  await pipeline(response.body, fileStream);

  await tar.x({
    file: tarPath,
    cwd: gamePath,
    strip: 1, // Strip the first directory component from the tar
  });

  await fs.unlink(tarPath);
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function startGameServer(gameId: string, version: string, controller: AbortController): Promise<string> {
  const serverKey = `${gameId}@${version}`;

  // Return existing server port if already running
  const existing = gameServers.get(serverKey);
  if (existing) {
    return existing.url;
  }

  const gamePath = getCachePath(gameId, version);
  const port = await findAvailablePort();

  console.log(`[GameServer] Starting server for ${gameId}@${version} at port ${port}`);
  console.log(`[GameServer] Serving files from: ${gamePath}`);
  const files = await fs.readdir(gamePath);
  console.log(`[GameServer] Files in cache:`, files);

  const app = new Hono();

  app.get('/*', async (c) => {
    let filePath = c.req.path;
    if (filePath === '/') filePath = '/index.html';

    const fullPath = path.join(gamePath, filePath);
    console.log(`[GameServer] Serving: ${fullPath}`);

    try {
      const content = await fs.readFile(fullPath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      return c.body(content, 200, { 'Content-Type': contentType });
    } catch (e) {
      console.log(`[GameServer] Not found: ${fullPath}`, e);
      return c.text('Not Found', 404);
    }
  });

  const server = serve({ fetch: app.fetch, port });

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  const address = server.address();
  let url;

  if (address && typeof address === "object") {
    const protocol = 'http'; // or 'https' if using TLS
    const host = address.address === '::' ? 'localhost' : address.address;
    const port = address.port;
    url = `${protocol}://${host}:${port}`;
  } else if (address) {
    url = address;
  } else {
    url = `http://localhost:${port}`;
  };

  gameServers.set(serverKey, { server, url, controller });
  return url;
}

const fullscreen = !isDev;

function createWindow(): void {
  process.env.STARTUP_CONFIG = JSON.stringify(args);

  const mainWindow = new BrowserWindow({
    fullscreen: fullscreen,
    ...(isDev && {
      width: 336 * scaleFactor,
      height: 262 * scaleFactor,
      useContentSize: true,
      resizable: false,
    }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading localhost game servers in iframes
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Auto-grant media permissions for games
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'audioCapture', 'videoCapture'];
    callback(allowedPermissions.includes(permission));
  });

  // Capture ShiftLeft even when iframe has focus
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.code === 'ShiftLeft' && !args.noExit) {
      mainWindow.webContents.send('menu-key-pressed');
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(scaleFactor);
  });

  if (!app.isPackaged) {
    // Use Vite dev server only when running from source
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await ensureCacheDir();

  ipcMain.handle('get-games', async (): Promise<GameInfo[]> => {
    const games = await apiClient.getAllGames();

    return games.map((game: Game) => ({
      id: game.id(),
      name: game.name(),
      latestVersion: game.latest().version(),
      contentUrl: game.latest().contentUrl(),
      dependencies: game.latest().dependencies(),
    }));
  });

  ipcMain.handle('load-game', async (event, game: GameInfo): Promise<Omit<LoadGameResult, "pluginPorts">> => {
    const { id, latestVersion } = game;
    const abortController = new AbortController();

    let url;

    if (id != undefined && latestVersion != undefined) {
      const cached = await isGameCached(id, latestVersion);
      if (!cached) {
        // Fetch fresh game data to get a valid (non-expired) contentUrl
        const freshGame = await apiClient.getGame(id);
        const contentUrl = freshGame.latest().contentUrl();

        if (!contentUrl) {
          throw new Error('No content URL available for this game');
        }
        await downloadAndExtract(contentUrl, id, latestVersion);
      }

      url = await startGameServer(id, latestVersion, abortController);
    } else if (id == undefined) {
      let overrideName;

      if (latestVersion === undefined) {
        overrideName = `${game.name}@LOCAL`
      } else {
        overrideName = `${game.name}@${latestVersion}`
      }

      const override = args.overrides.get(overrideName);

      if (override != undefined) {
        url = override;
      } else {
        throw new Error("Cannot load local game without override specifying hosted url.");
      }

      gameServers.set(overrideName, { server: undefined, url, controller: abortController })
    } else {
      throw new Error("Cannot load remote game with local_unversioned specifier. how did this happen?")
    }

    const pluginPorts: Record<string, Record<string, number>> = {};
    const ports = [];

    if (game.dependencies.findIndex(v => v.name === "@rcade/input-classic" && v.version === "1.0.0") != -1) {
      pluginPorts["@rcade/input-classic"] = {
        "1.0.0": ports.push(rcadeInputClassic(event.sender, abortController.signal)) - 1,
      }
    }

    event.sender.postMessage("plugin-ports", { structure: pluginPorts }, ports);

    return { url };
  });

  ipcMain.handle('unload-game', async (_event, gameId: string | undefined, gameName: string, version: string | undefined): Promise<void> => {
    let serverKey;

    if (gameId != undefined && version != undefined) {
      serverKey = `${gameId}@${version}`
    } else if (gameId === undefined) {
      if (version == undefined) {
        serverKey = `${gameName}@LOCAL`
      } else {
        serverKey = `${gameName}@${version}`
      }
    } else {
      throw new Error("Cannot unload game with id and local_unversioned specifier. how did this happen?")
    }

    const existing = gameServers.get(serverKey);
    if (existing) {
      existing.server?.close();
      existing.controller.abort();
      gameServers.delete(serverKey);
      console.log(`[GameServer] Stopped server for ${serverKey}`);
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
