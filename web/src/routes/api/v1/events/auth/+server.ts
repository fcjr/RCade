import type { RequestHandler } from "@sveltejs/kit";
import * as z from "zod";
import { ZodError } from "zod";
import { getActiveEvents, registerEventAuthentication } from "$lib/event";
import { verifyTotp } from "$lib/auth/totp";
import { TOTP_PARAMS } from "@rcade/api";

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

const EventAuthRequest = z.object({
    // GitHub username rules: 1-39 chars, alphanumeric with inner hyphens
    github_username: z.string().regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
        "Invalid GitHub username"),
    code: z.string().regex(new RegExp(`^\\d{${TOTP_PARAMS.digits}}$`),
        `Code must be ${TOTP_PARAMS.digits} digits`),
});

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
    const limiter = platform?.env?.EVENT_AUTH_RATE_LIMITER;
    if (limiter) {
        let key = "unknown";
        try {
            key = getClientAddress();
        } catch {
            // dev server without client address info
        }

        try {
            const { success } = await limiter.limit({ key });
            if (!success) {
                return jsonResponse({ error: 'Too many attempts. Please wait a minute and try again.' }, 429);
            }
        } catch (error) {
            // Fail open: a rate-limiter hiccup shouldn't brick onboarding mid-event.
            console.error('Rate limiter error, failing open:', error);
        }
    }

    let body;
    try {
        body = await request.json();
    } catch (error) {
        if (error instanceof SyntaxError) {
            return jsonResponse({ error: 'Invalid JSON in request body' }, 400);
        }
        throw error;
    }

    let auth;
    try {
        auth = EventAuthRequest.parse(body);
    } catch (error) {
        if (error instanceof ZodError) {
            const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            return jsonResponse({ error: 'Invalid request', details: issues }, 400);
        }
        throw error;
    }

    try {
        const now = new Date();
        const active = await getActiveEvents(now);

        if (active.length === 0) {
            return jsonResponse({ error: 'No event is currently active.' }, 404);
        }

        const matched = [];
        for (const event of active) {
            if (await verifyTotp(event.totp_secret, auth.code, now.getTime())) {
                matched.push(event);
            }
        }

        if (matched.length === 0) {
            return jsonResponse({
                error: `Invalid or expired code. Codes rotate every ${TOTP_PARAMS.periodSeconds} seconds — check the cabinet screen and try again.`
            }, 401);
        }

        for (const event of matched) {
            await registerEventAuthentication(event.id, auth.github_username);
        }

        return jsonResponse({
            success: true,
            github_username: auth.github_username.toLowerCase(),
            events: matched.map(event => ({ id: event.id, name: event.name })),
        }, 200);
    } catch (error) {
        console.error('Event auth failed:', error);
        return jsonResponse({ error: 'Event authentication failed. Please try again.' }, 500);
    }
};
