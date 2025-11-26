import * as z from "zod";
import { ZodSemverUnbranded } from "zod-semver";

export const ManifestAuthor = z.object({
    display_name: z.string(),
    recurse_id: z.number().optional(),
})

export const Manifest = z.object({
    name: z.string().nonempty(),
    description: z.string(),
    visibility: z.enum(["public", "private", "personal"]),
    version: ZodSemverUnbranded.optional(),
    authors: z.union([ManifestAuthor, z.array(ManifestAuthor)])
})