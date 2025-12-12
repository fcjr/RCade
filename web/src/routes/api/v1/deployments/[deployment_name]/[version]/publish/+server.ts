import { GithubOIDCValidator } from "$lib/auth/github";
import { Game } from "$lib/game";
import { RecurseAPIError } from "$lib/recurse";
import { invalidateGamesCache } from "$lib/cache";
import type { RequestHandler } from "@sveltejs/kit";
import { ZodError } from "zod";
import * as jose from "jose";
import { gameVersions } from "$lib/db/schema";
import { getDb } from "$lib/db";
import { and, eq } from "drizzle-orm";

const VALIDATOR = new GithubOIDCValidator();

function jsonResponse(body: object, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export const POST: RequestHandler = async ({ params, request, platform }) => {
    const deploymentName = params.deployment_name ?? "";
    const version = params.version ?? "";

    if (!deploymentName) {
        return jsonResponse({ error: 'Deployment name is required' }, 400);
    }

    if (!version) {
        return jsonResponse({ error: 'Version is required' }, 400);
    }

    const header = request.headers.get("Authorization");

    if (!header?.startsWith("Bearer ")) {
        return jsonResponse({ error: 'Missing or invalid Authorization header. Expected: Bearer <token>' }, 401);
    }

    const token = header.slice(7);
    if (!token) {
        return jsonResponse({ error: 'No GitHub OIDC JWT provided' }, 401);
    }

    let auth;
    try {
        auth = await VALIDATOR.validate(token);
    } catch (error) {
        if (error instanceof jose.errors.JOSEError) {
            console.error('OIDC validation failed:', error.code, error.message);
            return jsonResponse({ error: `Authentication failed: ${error.message}` }, 401);
        }
        if (error instanceof ZodError) {
            console.error('OIDC claims validation failed:', error.issues);
            return jsonResponse({ error: 'Invalid OIDC token claims' }, 401);
        }
        if (error instanceof RecurseAPIError) {
            console.error('Recurse API error:', error.code, error.message);
            return jsonResponse({ error: error.message }, error.statusCode);
        }
        throw error;
    }

    let body;

    try {
        body = await request.json();
    } catch (error) {
        console.warn('Failed to parse request body as JSON, defaulting to empty object:', error);
        body = {};
    }


    const game = await Game.byName(deploymentName);

    if (!game) {
        return jsonResponse({ error: 'Game not found' }, 404);
    }

    if (!game.matchesRepo(auth.repository)) {
        return jsonResponse({ error: 'Repository does not match game' }, 403);
    }

    const gameVersion = game.version(version);

    if (!gameVersion) {
        return jsonResponse({ error: 'Version not found' }, 404);
    }

    if (body.has_thumbnail) {
        await game.markVersionHasThumbnail(version);
    }

    try {
        const updated = await game.setVersionStatus(version, "published");

        if (!updated) {
            return jsonResponse({ error: 'Failed to update version status' }, 500);
        }

        await invalidateGamesCache(platform?.caches);

        return jsonResponse({ success: true, name: deploymentName, version, status: "published" }, 200);
    } catch (error) {
        console.error('Failed to publish version:', error);
        return jsonResponse({ error: 'Failed to publish version' }, 500);
    }
};
