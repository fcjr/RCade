import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ platform }) => {
    try {
        // Access your D1 database from the platform context
        const db = platform?.env?.DB;

        if (!db) {
            return new Response(
                JSON.stringify({ error: 'Database not available' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Query all items from your table
        const { results } = await db.prepare('SELECT * FROM items').all();

        return new Response(
            JSON.stringify(results),
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