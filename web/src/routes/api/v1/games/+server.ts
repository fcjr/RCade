import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ platform }) => {
    try {
        // Query all items from your table
        const r = await platform?.env.DB.prepare('SELECT * FROM items').all();

        return new Response(
            JSON.stringify(r?.results),
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