import { GithubOIDCValidator } from "$lib/auth/github";
import { getDb } from "$lib/db";
import { games } from "$lib/db/schema";
import { Game } from "$lib/game";
import { Manifest } from "$lib/manifest";
import type { RequestHandler } from "@sveltejs/kit";

const VALIDATOR = new GithubOIDCValidator();

export const POST: RequestHandler = async ({ params, request }) => {
    try {
        let token: string | undefined = undefined;
        const header = request.headers.get("Authorization");

        if (header != undefined && header.startsWith("Bearer ")) {
            token = header.slice(0, 7);
        }

        if (token == undefined) {
            return new Response(
                JSON.stringify({ error: 'No github OIDC JWT provided' }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const auth = await VALIDATOR.validate(token);

        const manifest = Manifest.parse(await request.json());
        let game = await Game.byName(params.game_name ?? "");

        if (game == undefined) {
            game = await Game.new(manifest.name, auth);
        }

        const { upload_url } = await game.publishVersion(manifest);

        return new Response(
            JSON.stringify({ upload_url }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Database error:', error);

        return new Response(
            JSON.stringify({ error: 'Failed to fetch items' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};