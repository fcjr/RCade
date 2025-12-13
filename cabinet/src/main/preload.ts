/// <reference lib="dom" />

import { contextBridge, ipcRenderer } from 'electron';
import type { RcadeAPI, GameInfo, Route } from '../shared/types';

const args = JSON.parse(process.env.STARTUP_CONFIG || '{}');

const portCache = new Map<string, { port: MessagePort; name: string; version: string }>();
const pendingRequests = new Map<string, { resolve: (value: any) => void, reject: (error: any) => void }>();

ipcRenderer.on('plugin-port-ready', (event: Electron.IpcRendererEvent, data: { nonce: string; name: string; version: string }) => {
  const { nonce, name, version } = data;
  const port = event.ports[0];

  const pending = pendingRequests.get(nonce);

  if (pending) {
    pendingRequests.delete(nonce);

    // Post the port to window so it can be received in renderer
    window.postMessage({ type: 'plugin-port-transfer', nonce, name, version }, '*', [port]);
    pending.resolve({ nonce, name, version });
  } else {
    portCache.set(nonce, { port, name, version });
  }
});

const rcadeAPI: RcadeAPI = {
  getArgs: () => args,
  getGames: () => ipcRenderer.invoke('get-games'),
  getMenuGame: () => ipcRenderer.invoke('get-menu-game'),
  loadGame: async (game: GameInfo) => await ipcRenderer.invoke('load-game', game),
  unloadGame: (gameId: string | undefined, name: string, version: string | undefined) => ipcRenderer.invoke('unload-game', gameId, name, version),
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
  acquirePlugin: async (name: string, version: string): Promise<{ nonce: string, name: string, version: string }> => {
    const { nonce } = await ipcRenderer.invoke("get-plugin-port", name, version);

    const cached = portCache.get(nonce);
    if (cached) {
      portCache.delete(nonce);
      // Post cached port to window
      window.postMessage({ type: 'plugin-port-transfer', nonce, name, version }, '*', [cached.port]);
      return { nonce, name, version };
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(nonce);
        reject(new Error(`Timeout waiting for plugin port: ${name}@${version} (nonce: ${nonce})`));
      }, 5000);

      pendingRequests.set(nonce, {
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