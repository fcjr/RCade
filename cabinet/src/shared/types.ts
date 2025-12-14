import { GameManifest, Permission } from '@rcade/api';
import type { ScreensaverConfig } from '@rcade/plugin-sleep';
import { QuitOptions } from '@rcade/sdk';
import { z } from 'zod';

export interface PackageVersion {
  packageId: string;
  version: string;
}

export interface CliOptions {
  manifest: GameManifest | null;
  menuManifest: GameManifest | null;
  noExit: boolean;
  forceScreensaver: boolean;
  dev: boolean;
  devtools: boolean | undefined;
  scale: number | null;
  overrides: Map<string, string>;
}

export const VersionsSchema = z.object({
  node: z.string(),
  chrome: z.string(),
  electron: z.string(),
});

export type Versions = z.infer<typeof VersionsSchema>;

export interface GameInfo {
  id: string | undefined;
  name: string;
  displayName: string | null | undefined;
  latestVersion: string | undefined;
  authors: {
    display_name: string,
  }[];
  dependencies: {
    name: string,
    version: string,
  }[];
  permissions: Permission[];
}

export type Route =
  | { page: 'blank' }
  | { page: 'game'; game: GameInfo };

export interface LoadGameResult {
  url: string;
}

export interface RcadeAPI {
  getArgs: () => CliOptions & { isDev: boolean };
  getGames: () => Promise<GameInfo[]>;
  getMenuGame: () => Promise<GameInfo>;
  loadGame: (game: GameInfo) => Promise<LoadGameResult>;
  unloadGame: (gameId: string | undefined, gameName: string, version: string | undefined, quitOptions: QuitOptions) => Promise<void>;
  onUnloadGame: (callback: () => void) => () => void;
  onMenuKey: (callback: () => void) => () => void;
  onInputActivity: (callback: () => void) => () => void;
  onScreensaverConfigChanged: (callback: (config: ScreensaverConfig) => void) => () => void;
  screensaverStarted: () => void;
  screensaverStopped: () => void;
  acquirePlugin: (name: string, version: string, gameInstance: string) => Promise<{ nonce: string, name: string, version: string }>;
  onRoute: (callback: (route: Route) => void) => () => void;
}
