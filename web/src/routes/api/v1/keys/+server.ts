import { getDb } from "$lib/db/index.js";
import { appKeys, apps } from "$lib/db/schema";
import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

function uint8ArrayToHex(buffer: Uint8Array) {
    return Array.prototype.map.call(buffer, x => {
        return x.toString(16).padStart(2, '0');
    }).join('');
}

export const POST = async ({ request, locals }) => {
    try {
        const { appId } = await request.json();

        if (!appId) {
            return json({ error: 'Missing appId' }, { status: 400 });
        }

        // 1. Verify App exists and (Optionally) belongs to user
        const app = await getDb().query.apps.findFirst({
            where: eq(apps.id, appId)
        });

        if (!app) {
            return json({ error: 'App not found' }, { status: 404 });
        }

        const auth = await locals.auth();

        if (!auth) {
            return json({ error: 'Unauthenticated' }, { status: 403 });
        }

        const rc_id = auth.user.rc_id;

        const array = new Uint8Array(32);
        self.crypto.getRandomValues(array);

        // 2. Generate a secure API Key
        // Example: 'sk_live_' + 32 bytes of hex
        const generatedKey = `sk_${uint8ArrayToHex(array)}`;

        // 3. Insert into DB
        const newKey = await getDb().insert(appKeys).values({
            appId,
            rc_id,
            key: generatedKey,
            createdAt: new Date(),
        }).returning();

        return json({ key: newKey[0] }, { status: 201 });

    } catch (error) {
        console.error('Error creating key:', error);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};