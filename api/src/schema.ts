import { z } from "zod";
import { Categories } from "./categories.js";
import { Permission } from "./game/manifest.js";

export const GameAuthorResponse = z.object({
  display_name: z.string(),
  recurse_id: z.number().nullable().optional(),
});

export const GameDependencyResponse = z.object({
  name: z.string(),
  version: z.string(),
});

export const GameVersionResponse = z.object({
  displayName: z.string().nullable().optional(),
  description: z.string(),
  visibility: z.enum(["public", "internal", "private"]),
  version: z.string(),
  authors: z.array(GameAuthorResponse),
  dependencies: z.array(GameDependencyResponse),
  categories: z.array(Categories),
  remixOf: z.object({
    id: z.string(),
    name: z.string(),
    git: z.object({
      ssh: z.string(),
      https: z.string(),
    }),
    owner_rc_id: z.string(),
    version: z.object({
      displayName: z.string().nullable().optional(),
      description: z.string(),
      visibility: z.enum(["public", "internal", "private"]),
      version: z.string(),
      remixOf: z.object({
        id: z.string(),
        version: z.object({
          version: z.string(),
        })
      }).optional(),
    })
  }).optional(),
  contents: z.object({
    url: z.string(),
    expires: z.number(),
  }).optional(),
  permissions: z.array(Permission).optional(),
});

export const GameResponse = z.object({
  id: z.string(),
  name: z.string(),
  git: z.object({
    ssh: z.string(),
    https: z.string(),
  }),
  owner_rc_id: z.string(),
  versions: z.array(GameVersionResponse),
});

export const GamesResponse = z.array(GameResponse);

export type GameResponse = z.infer<typeof GameResponse>;
export type GamesResponse = z.infer<typeof GamesResponse>;
