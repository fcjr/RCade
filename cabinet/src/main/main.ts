import { app, BrowserWindow, ipcMain, session, nativeImage, Menu } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import net from 'net';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Client, Game, Permission } from '@rcade/api';
import * as tar from 'tar';
import type { GameInfo, LoadGameResult } from '../shared/types';
import { parseCliArgs } from "./args.js";
import { PluginManager } from '../plugins/index.js';

const args = parseCliArgs();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged || args.dev;

// Icon path - in dev mode use assets folder, in production it's bundled
const iconPath = isDev
  ? path.join(__dirname, '../../assets/icon.png')
  : path.join(__dirname, '../assets/icon.png');

// Emoji font path for fallback support in iframed games
const emojiFontPath = isDev
  ? path.join(__dirname, '../../assets/fonts/NotoColorEmoji.ttf')
  : path.join(__dirname, '../assets/fonts/NotoColorEmoji.ttf');

// Scale factor of 2 is the largest reasonable size for a normal macbook screen
// and should stay the default for development.
const scaleFactor = args.scale ?? (isDev ? 2 : 1);

app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

if (process.platform === 'linux') {
  // WebGPU via Vulkan/ANGLE

  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  // Enable audio output via ALSA (required for some Linux systems)
  app.commandLine.appendSwitch('alsa-output-device', 'default');

  // Disable Cursor in production only
  if (!isDev) {
    app.commandLine.appendSwitch('use-angle', 'vulkan');
    app.commandLine.appendSwitch('use-gl', 'egl');
    app.commandLine.appendSwitch('enable-features', 'Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,WaylandWindowDecorations,SharedArrayBuffer');
    app.commandLine.appendSwitch('enable-unsafe-webgpu');

    app.commandLine.appendSwitch('cursor', 'none');
  }
}

const cabinetApiKey = process.env.CABINET_API_KEY;
const apiClient = cabinetApiKey ? Client.newKeyed(cabinetApiKey) : Client.new();

// Cache directory for game files
const cacheDir = path.join(app.getPath('userData'), 'game-cache');

// Path for cached game list (for offline support)
const gamesListCachePath = path.join(app.getPath('userData'), 'games-list.json');

// Track running game servers
const gameServers = new Map<string, { server?: ReturnType<typeof serve>; url: string; controller: AbortController }>();

// Track current game's permissions for the permission handler
let currentGamePermissions: Permission[] = [];

function getCachePath(gameId: string, version: string): string {
  return path.join(cacheDir, gameId, version);
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
}

async function saveGamesListCache(games: GameInfo[]): Promise<void> {
  await fs.writeFile(gamesListCachePath, JSON.stringify(games, null, 2));
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

  // CSP to block fetch, websockets, and other network requests
  // Also blocks access to various browser APIs
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src *",
    "connect-src 'self' data: blob:",  // allow fetching local assets and data/blob URIs, block external requests
    "media-src 'self'",
    // TODO: workers should be moved to a plugin API for better sandboxing
    "worker-src 'self' blob:",
  ].join('; ');

  // script to block storage APIs (localStorage, sessionStorage, cookies) and input events
  const storageBlockerScript = `<script>
(function() {
  // Block localStorage
  Object.defineProperty(window, 'localStorage', {
    get: function() { throw new DOMException('localStorage is disabled', 'SecurityError'); },
    configurable: false
  });
  // Block sessionStorage
  Object.defineProperty(window, 'sessionStorage', {
    get: function() { throw new DOMException('sessionStorage is disabled', 'SecurityError'); },
    configurable: false
  });
  // Block cookies
  Object.defineProperty(document, 'cookie', {
    get: function() { return ''; },
    set: function() { throw new DOMException('Cookies are disabled', 'SecurityError'); },
    configurable: false
  });
  // Block IndexedDB
  Object.defineProperty(window, 'indexedDB', {
    get: function() { throw new DOMException('IndexedDB is disabled', 'SecurityError'); },
    configurable: false
  });
  // Block Cache API
  Object.defineProperty(window, 'caches', {
    get: function() { throw new DOMException('Cache API is disabled', 'SecurityError'); },
    configurable: false
  });
  // Block keyboard/mouse/touch/pointer events on document
  var blockedEvents = [
    'keydown', 'keyup', 'keypress',
    'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
    'mouseenter', 'mouseleave', 'mouseover', 'mouseout',${isDev ? '' : " 'contextmenu',"}
    'wheel', 'scroll',
    'pointerdown', 'pointerup', 'pointermove', 'pointerenter',
    'pointerleave', 'pointerover', 'pointerout', 'pointercancel'
  ];
  var originalDocAddEventListener = document.addEventListener.bind(document);
  document.addEventListener = function(type, listener, options) {
    if (blockedEvents.indexOf(type) !== -1) {
      console.error('document.addEventListener("' + type + '") is disabled. Use the input plugin instead.');
      return;
    }
    return originalDocAddEventListener(type, listener, options);
  };
})();

</script>`;

  // Emoji font CSS - provides embedded Noto Color Emoji as fallback
  const emojiFontStyle = `<style>
@font-face {
  font-family: 'Noto Color Emoji';
  src: url('/fonts/NotoColorEmoji.ttf') format('truetype');
  font-display: swap;
}
</style>`;

  // Serve emoji font for games
  app.get('/fonts/NotoColorEmoji.ttf', async (c) => {
    try {
      const fontContent = await fs.readFile(emojiFontPath);
      return c.body(new Uint8Array(fontContent), 200, {
        'Content-Type': 'font/ttf',
        'Cache-Control': 'public, max-age=31536000',
      });
    } catch (e) {
      console.log(`[GameServer] Font not found: ${emojiFontPath}`, e);
      return c.text('Not Found', 404);
    }
  });

  app.get('/*', async (c) => {
    let filePath = c.req.path;
    if (filePath === '/') filePath = '/index.html';

    const fullPath = path.join(gamePath, filePath);
    console.log(`[GameServer] Serving: ${fullPath}`);

    try {
      const rawContent = await fs.readFile(fullPath);
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
      const headers = {
        'Content-Type': contentType,
        'Content-Security-Policy': cspHeader,
        'Access-Control-Allow-Origin': 'null',
      };

      // inject storage blocker script and emoji font into HTML files
      if (ext === '.html') {
        let html = rawContent.toString('utf-8');
        const injectedContent = storageBlockerScript + emojiFontStyle;
        // insert after <head> or at the start of the document
        if (html.includes('<head>')) {
          html = html.replace('<head>', '<head>' + injectedContent);
        } else if (html.includes('<html>')) {
          html = html.replace('<html>', '<html><head>' + injectedContent + '</head>');
        } else {
          html = injectedContent + html;
        }
        return c.body(html, 200, headers);
      }

      return c.body(new Uint8Array(rawContent), 200, headers);
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
  process.env.STARTUP_CONFIG = JSON.stringify({ ...args, isDev });

  const mainWindow = new BrowserWindow({
    fullscreen: fullscreen,
    icon: iconPath,
    show: false, // Don't show until ready for proper focus handling
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

  // Show and focus window when ready - ensures proper input handling on Pi
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (args.devtools ?? isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Enable right-click context menu in dev mode for inspect element
  if (isDev) {
    mainWindow.webContents.on('context-menu', (_event, params) => {
      Menu.buildFromTemplate([
        { label: 'Inspect Element', click: () => mainWindow.webContents.inspectElement(params.x, params.y) },
        { type: 'separator' },
        { label: 'Reload', click: () => mainWindow.webContents.reload() },
        { label: 'Force Reload', click: () => mainWindow.webContents.reloadIgnoringCache() },
      ]).popup();
    });
  }

  // Handle permissions for sandboxed iframe content based on game manifest
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      // Map Electron permission names to our Permission type
      if (permission === 'media' && currentGamePermissions.includes('camera')) {
        callback(true);
        return;
      }
      callback(false);
    }
  );

  // capture menu button even when iframe has focus
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.code === "Escape" && !args.noExit) {
      mainWindow.webContents.send("menu-key-pressed");
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.setZoomFactor(scaleFactor);
    // Ensure window has focus for input on Raspberry Pi
    mainWindow.focus();
    mainWindow.webContents.focus();
  });

  if (!app.isPackaged) {
    // Use Vite dev server only when running from source
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await ensureCacheDir();

  // Set dock icon on macOS (only in dev mode - production uses app bundle icon)
  if (isDev && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  ipcMain.handle('get-games', async (): Promise<GameInfo[]> => {
    try {
      const games = await apiClient.getAllGames();

      const gameInfos = games.map((game: Game) => ({
        id: game.id(),
        name: game.name(),
        displayName: game.latest().displayName(),
        latestVersion: game.latest().version(),
        contentUrl: game.latest().contentUrl(),
        authors: game.latest().authors().map(a => ({ display_name: a.display_name })),
        dependencies: game.latest().dependencies(),
        permissions: game.latest().permissions(),
      }));

      // cache the game list for offline use
      await saveGamesListCache(gameInfos);

      return gameInfos;
    } catch (error) {
      // if api fails (offline), try to load from cache
      console.log('[Games] API fetch failed, trying cached list:', error);
      const cachedGames = await loadGamesListCache();
      if (cachedGames) {
        // show to only games that are actually downloaded if offline
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
        return availableGames;
      }
      throw error;
    }
  });

  ipcMain.handle('load-game', async (event, game: GameInfo): Promise<Omit<LoadGameResult, "pluginPorts">> => {
    const { id, latestVersion } = game;
    const abortController = new AbortController();

    // Set current game permissions for the permission handler
    currentGamePermissions = game.permissions ?? [];

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

    const pm = await PluginManager.loadInto(event.sender, game.dependencies);

    abortController.signal.addEventListener("abort", () => {
      pm.destroy();
    })

    return { url };
  });

  ipcMain.handle('unload-game', async (_event, gameId: string | undefined, gameName: string, version: string | undefined): Promise<void> => {
    // Clear game permissions when unloading
    currentGamePermissions = [];

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
