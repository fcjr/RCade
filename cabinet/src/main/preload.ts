import { contextBridge, ipcRenderer } from 'electron';
import type { RcadeAPI } from '../shared/types';

const rcadeAPI: RcadeAPI = {
  getVersions: () => ipcRenderer.invoke('get-versions'),
};

contextBridge.exposeInMainWorld('rcade', rcadeAPI);
