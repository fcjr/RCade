import { getDb } from "$lib/db";
import { games } from "$lib/db/schema";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ platform }) => {
    try {
        // Query all items from your table
        const r = await getDb().select().from(games).all();
        console.log(r); // Log the results to the console for debugging

        return new Response(
            JSON.stringify(r),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        console.error('Database error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to fetch items' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};