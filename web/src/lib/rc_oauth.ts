import * as z from 'zod';

export const RecurseResponse = z.object({
    id: z.number(),
    first_name: z.string(),
    last_name: z.string(),
    name: z.string(),
    email: z.string(),
    github: z.string().nullable(),
    // TODO
});

export type RecurseResponse = z.infer<typeof RecurseResponse>;