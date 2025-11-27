import * as z from "zod";

export const ManifestAuthor = z.object({
    display_name: z.string(),
    recurse_id: z.number().optional(),
})

export const regexSemverNumberedGroups =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * This ZodSchema is able to detect SemVer Strings based on the official specification and types its output as "string".
 */
export const ZodSemverUnbranded = z.string().regex(
    regexSemverNumberedGroups,
)

export const Manifest = z.object({
  name: z
    .string()
    .nonempty()
    .regex(/[a-zA-Z0-9_-]*/),
  display_name: z.string().optional(),
  description: z.string(),
  visibility: z.enum(["public", "private", "personal"]),
  version: ZodSemverUnbranded.optional(),
  authors: z.union([ManifestAuthor, z.array(ManifestAuthor).min(1)]),
});

export type Manifest = z.infer<typeof Manifest>;