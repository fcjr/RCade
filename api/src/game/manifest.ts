import * as z from "zod";
import { Categories } from "../categories.js";

export const Permission = z.enum(["camera"]);
export type Permission = z.infer<typeof Permission>;

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

export const ManifestDependency = z.object({
    name: z.string(),
    version: ZodSemverUnbranded,
})

export const Manifest = z.object({
    kind: z.literal("game").optional(),
    name: z
        .string()
        .nonempty()
        .regex(/[a-zA-Z0-9_-]*/),
    display_name: z.string().optional(),
    description: z.string(),
    visibility: z.enum(["public", "internal", "private"]),
    version: ZodSemverUnbranded.optional(),
    categories: z.array(Categories).optional().default([]),
    authors: z.union([ManifestAuthor, z.array(ManifestAuthor).min(1)]),
    dependencies: z.array(ManifestDependency).optional(),
    thumbnail: z.union([
        z.object({
            url: z.string(),
        }),
        z.object({
            path: z.string(),
        })
    ]).optional(),
    remix_of: z.object({
        name: z
            .string()
            .nonempty()
            .regex(/[a-zA-Z0-9_-]*/),
        version: ZodSemverUnbranded,
    }).optional(),
    permissions: z.array(Permission).optional(),
});

export type Manifest = z.infer<typeof Manifest>;
