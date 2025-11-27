import { z } from 'zod';

export const VersionsSchema = z.object({
  node: z.string(),
  chrome: z.string(),
  electron: z.string(),
});

export type Versions = z.infer<typeof VersionsSchema>;

export interface RcadeAPI {
  getVersions: () => Promise<Versions>;
}
