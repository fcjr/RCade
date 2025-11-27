import { contextBridge, ipcRenderer } from 'electron';
import type { RcadeAPI, GameInfo } from '../shared/types';

const rcadeAPI: RcadeAPI = {
  getGames: () => ipcRenderer.invoke('get-games'),
  loadGame: (game: GameInfo) => ipcRenderer.invoke('load-game', game),
  unloadGame: (gameId: string, version: string) => ipcRenderer.invoke('unload-game', gameId, version),
};

contextBridge.exposeInMainWorld('rcade', rcadeAPI);
