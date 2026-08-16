import type { RequestHandler } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { getActiveEvents } from "$lib/event";
import { timingSafeEqualStrings } from "$lib/auth/compare";

const noCacheHeaders = {
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
};

function jsonResponse(body: object, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...noCacheHeaders }
    });
}

export const GET: RequestHandler = async ({ request }) => {
    // This endpoint returns a TOTP secret, so unlike the games routes it must
    // hard-fail when the key is unconfigured (`Bearer undefined` spoof) and
    // compare in constant time.
    const configuredKey = env.CABINET_API_KEY;
    if (!configuredKey) {
        console.error('CABINET_API_KEY is not configured; refusing /events/current');
        return jsonResponse({ error: 'Server misconfigured' }, 500);
    }

    const header = request.headers.get("Authorization");
    if (!header?.startsWith("Bearer ")) {
        return jsonResponse({ error: 'Missing or invalid Authorization header. Expected: Bearer <token>' }, 401);
    }

    if (!(await timingSafeEqualStrings(header.slice(7), configuredKey))) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    try {
        const now = new Date();
        const active = await getActiveEvents(now);
        // Most recently started event wins if several overlap; /events/auth
        // still accepts codes from any active event.
        const event = active[0];

        if (event === undefined) {
            return jsonResponse({ active: false, server_time: Date.now() }, 200);
        }

        return jsonResponse({
            active: true,
            event: {
                id: event.id,
                name: event.name,
                starts_at: event.starts_at.toISOString(),
                ends_at: event.ends_at.toISOString(),
                totp_secret: event.totp_secret,
            },
            // epoch ms; the cabinet compares against its own clock to warn on skew
            server_time: Date.now(),
        }, 200);
    } catch (error) {
        console.error('Database error:', error);
        return jsonResponse({ error: 'Failed to fetch current event' }, 500);
    }
};
