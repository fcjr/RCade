import { getDb } from '$lib/db/index.js';
import { appKeys } from '$lib/db/schema.js';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

export const GET = async ({ params, locals }) => {
    try {
        const session = await locals.auth();
        if (!session?.user) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;

        const keyData = await getDb().query.appKeys.findFirst({
            where: and(
                eq(appKeys.id, id),
                eq(appKeys.rc_id, session.user.rc_id)
            ),
            columns: {
                id: true,
                appId: true,
                rc_id: true,
                lastUsedAt: true,
                createdAt: true,
            },
            with: {
                app: true,
            }
        });

        if (!keyData) {
            return json({ error: 'Key not found' }, { status: 404 });
        }

        return json({ key: keyData });

    } catch (error) {
        console.error('Error fetching key:', error);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

export const DELETE = async ({ params, locals }) => {
    try {
        const session = await locals.auth();
        if (!session?.user) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;

        // Ensure the user owns the key they are deleting by checking rc_id
        const deletedKey = await getDb().delete(appKeys)
            .where(and(
                eq(appKeys.id, id),
                eq(appKeys.rc_id, session.user.rc_id)
            ))
            .returning();

        if (!deletedKey.length) {
            return json({ error: 'Key not found' }, { status: 404 });
        }

        return json({ success: true, message: 'Key deleted' });

    } catch (error) {
        console.error('Error deleting key:', error);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};