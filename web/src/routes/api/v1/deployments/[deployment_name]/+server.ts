import { GithubOIDCValidator } from "$lib/auth/github";
import { Game } from "$lib/game";
import { RecurseAPIError } from "$lib/recurse";
import { invalidateGamesCache } from "$lib/cache";
import { GameManifest } from "@rcade/api";
import type { RequestHandler } from "@sveltejs/kit";
import semver from "semver";
import { ZodError } from "zod";
import { env } from "$env/dynamic/private";
import * as jose from 'jose';

const VALIDATOR = new GithubOIDCValidator();

async function triggerCommunityClone(sourceRepo: string, deploymentName: string, version: string) {
    const response = await fetch('https://api.github.com/repos/fcjr/rcade/actions/workflows/clone-to-community.yaml/dispatches', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'RCade Community'
        },
        body: JSON.stringify({
            ref: 'main',
            inputs: {
                source_repo: sourceRepo,
                deployment_name: deploymentName,
                version: version
            }
        })
    });

    if (!response.ok) {
        console.error('Failed to trigger community clone workflow:', response.status, await response.text());
    }
}

function jsonResponse(body: object, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export const POST: RequestHandler = async ({ params, request, platform }) => {
    const deploymentName = params.deployment_name ?? "";
    if (!deploymentName) {
        return jsonResponse({ error: 'Deployment name is required' }, 400);
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

    if (auth.repository_visibility !== "public") {
        return jsonResponse({
            error: 'Only public repositories can be deployed to RCade. Please make your repository public and try again.'
        }, 403);
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

    let manifest;
    try {
        manifest = GameManifest.parse(body);
    } catch (error) {
        if (error instanceof ZodError) {
            const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            return jsonResponse({ error: 'Invalid manifest', details: issues }, 400);
        }
        throw error;
    }

    if (deploymentName !== manifest.name) {
        return jsonResponse({ error: 'Deployment name does not match object name in manifest' }, 400);
    }

    // Check deployment restrictions
    if (manifest.deployment) {
        const [actualOwner, actualRepo] = auth.repository.split('/');

        if (manifest.deployment.github_owner && manifest.deployment.github_owner !== actualOwner) {
            return jsonResponse({
                error: `Deployment restricted: github_owner '${manifest.deployment.github_owner}' does not match '${actualOwner}'`
            }, 403);
        }

        if (manifest.deployment.github_repo && manifest.deployment.github_repo !== actualRepo) {
            return jsonResponse({
                error: `Deployment restricted: github_repo '${manifest.deployment.github_repo}' does not match '${actualRepo}'`
            }, 403);
        }
    }

    let game = await Game.byName(deploymentName);

    if (game !== undefined && !game.matchesRepo(auth.repository)) {
        const owner = auth.repository_owner;
        return jsonResponse({
            error: `Game '${deploymentName}' is already registered to a different repository. ` +
                `If you're developing on a fork, rename your game to '${deploymentName}-${owner}' ` +
                `in rcade.manifest.json`
        }, 403);
    }

    try {
        let version: string;

        if (game == undefined) {
            version = manifest.version ?? "1.0.0";
            game = await Game.new(manifest.name, auth);
        } else {
            if (manifest.version) {
                version = manifest.version;
            } else {
                const latest = await game.latestVersionNumber();
                if (latest == undefined) {
                    version = "1.0.0";
                } else {
                    const bumped = semver.inc(latest, "patch");
                    if (bumped == null) {
                        console.error('Failed to increment version:', latest);
                        return jsonResponse({ error: `Unable to auto-increment version from '${latest}'` }, 500);
                    }
                    version = bumped;
                }
            }
        }

        // fire-and-forget: trigger community clone workflow
        // this runs async in github actions and won't block the deployment
        // TODO: should we keep track of the state of this for remix?
        triggerCommunityClone(auth.repository, deploymentName, version).catch((err) => {
            console.error('Error triggering community clone:', err);
        });

        const { upload_url, expires } = await game.publishVersion(version, manifest);

        await invalidateGamesCache(platform?.caches);

        return jsonResponse({ upload_url, expires, version }, 200);
    } catch (error) {
        if (error instanceof Error && error.message === "Version mismatch") {
            return jsonResponse({ error: 'Manifest version does not match the target version' }, 409);
        }

        console.error('Deployment failed:', error);
        return jsonResponse({ error: 'Deployment failed. Please try again or contact support.' }, 500);
    }
};