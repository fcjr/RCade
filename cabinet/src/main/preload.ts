/// <reference lib="dom" />

import { contextBridge, ipcRenderer } from 'electron';
import type { RcadeAPI, GameInfo } from '../shared/types';

const args = JSON.parse(process.env.STARTUP_CONFIG || '{}');

const rcadeAPI: RcadeAPI = {
  getArgs: () => args,
  getGames: () => ipcRenderer.invoke('get-games'),
  loadGame: async (game: GameInfo) => await ipcRenderer.invoke('load-game', game),
  unloadGame: (gameId: string | undefined, name: string, version: string | undefined) => ipcRenderer.invoke('unload-game', gameId, name, version),
  onMenuKey: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('menu-key-pressed', listener);
    return () => ipcRenderer.removeListener('menu-key-pressed', listener);
  },
  acquirePlugin: (name: string, version: string) => ipcRenderer.invoke("get-plugin-port", name, version),
};

contextBridge.exposeInMainWorld('rcade', rcadeAPI);
