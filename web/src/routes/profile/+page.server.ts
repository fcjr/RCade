import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';
import { appKeys } from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
    const a = await locals.auth()!;

    try {
        const keys = await getDb().query.appKeys.findMany({
            where: eq(appKeys.rc_id, a!.user.rc_id),
            with: {
                app: true // Include the relation
            }
        });

        return {
            keys
        };

    } catch (err) {
        console.error('Database error:', err);
        throw error(500, 'Failed to fetch application keys');
    }
};