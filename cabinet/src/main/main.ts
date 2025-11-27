import { app, BrowserWindow, ipcMain } from 'electron';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

const apiClient = Client.new();

// Cache directory for game files
const cacheDir = path.join(app.getPath('userData'), 'game-cache');

// Track running game servers
const gameServers = new Map<string, { server: ReturnType<typeof serve>; port: number }>();

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

async function startGameServer(gameId: string, version: string): Promise<number> {
  const serverKey = `${gameId}@${version}`;

  // Return existing server port if already running
  const existing = gameServers.get(serverKey);
  if (existing) {
    return existing.port;
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

  gameServers.set(serverKey, { server, port });
  return port;
}

const fullscreen = !isDev;

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    fullscreen: fullscreen,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading localhost game servers in iframes
    },
  });

  if (isDev) {
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
    }));
  });

  ipcMain.handle('load-game', async (_event, game: GameInfo): Promise<LoadGameResult> => {
    const { id, latestVersion } = game;

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

    const port = await startGameServer(id, latestVersion);
    return { url: `http://localhost:${port}` };
  });

  ipcMain.handle('unload-game', async (_event, gameId: string, version: string): Promise<void> => {
    const serverKey = `${gameId}@${version}`;
    const existing = gameServers.get(serverKey);
    if (existing) {
      existing.server.close();
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
