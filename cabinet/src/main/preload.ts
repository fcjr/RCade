/// <reference lib="dom" />

import { contextBridge, ipcRenderer } from 'electron';
import type { RcadeAPI, GameInfo, Route } from '../shared/types';
import type { ScreensaverConfig } from '@rcade/plugin-sleep';
import { QuitOptions } from '@rcade/sdk';

const args = JSON.parse(process.env.STARTUP_CONFIG || '{}');

const portCache = new Map<string, { port: MessagePort; name: string; version: string; gameInstance: string }>();
const pendingRequests = new Map<string, { resolve: (value: any) => void, reject: (error: any) => void }>();

const genPortId = (nonce: string, gameInstance: string) => `${nonce} ${gameInstance}`

ipcRenderer.on('plugin-port-ready', (event: Electron.IpcRendererEvent, data: { nonce: string; name: string; version: string, gameInstance: string }) => {
  const { nonce, name, version, gameInstance } = data;
  const port = event.ports[0];

  const portId = genPortId(nonce, gameInstance);
  const pending = pendingRequests.get(portId);

  if (pending) {
    pendingRequests.delete(portId);

    // Post the port to window so it can be received in renderer
    window.postMessage({ type: 'plugin-port-transfer', nonce, name, version, gameInstance }, '*', [port]);
    pending.resolve({ nonce, name, version, gameInstance });
  } else {
    portCache.set(portId, { port, name, version, gameInstance });
  }
});

const rcadeAPI: RcadeAPI = {
  getArgs: () => args,
  getGames: () => ipcRenderer.invoke('get-games'),
  getMenuGame: () => ipcRenderer.invoke('get-menu-game'),
  loadGame: async (game: GameInfo) => await ipcRenderer.invoke('load-game', game),
  unloadGame: (gameId: string | undefined, name: string, version: string | undefined, quitOptions: QuitOptions) => {
    ipcRenderer.emit('unload-game');
    return ipcRenderer.invoke('unload-game', gameId, name, version, quitOptions)
  },
  onUnloadGame: (callback: (config: ScreensaverConfig) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: ScreensaverConfig) => callback(config);
    ipcRenderer.on('unload-game', listener);
    return () => ipcRenderer.removeListener('unload-game', listener);
  },
  onMenuKey: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('menu-key-pressed', listener);
    return () => ipcRenderer.removeListener('menu-key-pressed', listener);
  },
  onInputActivity: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('input-activity', listener);
    return () => ipcRenderer.removeListener('input-activity', listener);
  },
  onScreensaverConfigChanged: (callback: (config: ScreensaverConfig) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: ScreensaverConfig) => callback(config);
    ipcRenderer.on('screensaver-config-changed', listener);
    return () => ipcRenderer.removeListener('screensaver-config-changed', listener);
  },
  screensaverStarted: () => ipcRenderer.send("screensaver-started"),
  screensaverStopped: () => ipcRenderer.send("screensaver-stopped"),
  acquirePlugin: async (name: string, version: string, gameInstance: string): Promise<{ nonce: string, name: string, version: string }> => {
    const { nonce } = await ipcRenderer.invoke("get-plugin-port", name, version, gameInstance);

    const portId = genPortId(nonce, gameInstance);
    const cached = portCache.get(portId);
    if (cached) {
      portCache.delete(portId);
      // Post cached port to window
      window.postMessage({ type: 'plugin-port-transfer', nonce, name, version, gameInstance }, '*', [cached.port]);
      return { nonce, name, version };
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(portId);
        reject(new Error(`Timeout waiting for plugin port: ${name}@${version} (nonce: ${nonce})`));
      }, 5000);

      pendingRequests.set(portId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject
      });
    });
  },
  onRoute: (callback: (route: Route) => void) => {
    const listener = (_: any, route: Route) => callback(route);
    ipcRenderer.on('route-move', listener);
    return () => ipcRenderer.removeListener('route-move', listener);
  }
};

contextBridge.exposeInMainWorld('rcade', rcadeAPI);
