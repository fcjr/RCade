import { GameManifest } from '@rcade/api';
import { z } from 'zod';

export interface PackageVersion {
  packageId: string;
  version: string;
}

export interface CliOptions {
  manifest: GameManifest | null;
  noExit: boolean;
  dev: boolean;
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
  latestVersion: string | undefined;
  dependencies: {
    name: string,
    version: string,
  }[];
}

export interface LoadGameResult {
  url: string;
}

export interface RcadeAPI {
  getArgs: () => CliOptions;
  getGames: () => Promise<GameInfo[]>;
  loadGame: (game: GameInfo) => Promise<LoadGameResult>;
  unloadGame: (gameId: string | undefined, gameName: string, version: string | undefined) => Promise<void>;
  onMenuKey: (callback: () => void) => () => void;
  acquirePlugin: (name: string, version: string) => Promise<{ port: MessagePort, name: string, version: string }>;
}
