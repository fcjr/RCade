import { env } from "$env/dynamic/private";
import { Game, S3 } from "$lib/game";
import type { RequestHandler } from "@sveltejs/kit";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

// Same-origin thumbnail proxy. Presigned R2 URLs can't carry the CORP header
// that Cross-Origin-Embedder-Policy requires, so the site loads thumbnails
// through this route instead.
export const GET: RequestHandler = async ({ locals, params, request }) => {
    const session = await locals.auth();

    const auth = session?.user ? { for: <const>"recurser", rc_id: session.user.rc_id } : request.headers.get("Authorization") == `Bearer ${env.CABINET_API_KEY}` ? { for: <const>"cabinet" } : { for: <const>"public" };

    try {
        const game = await Game.byId(params.game_id ?? "");
        const response = game === undefined ? undefined : await game.intoResponse(auth) as { versions: { version: string }[] } | undefined;
        const version = response?.versions.find(v => v.version === params.version);

        if (version === undefined) {
            return new Response('Not found', { status: 404 });
        }

        const url = await getSignedUrl(
            S3,
            new GetObjectCommand({ Bucket: "rcade", Key: `games/${params.game_id}/${params.version}/thumbnail.png`, ResponseContentType: 'image/png' }),
            { expiresIn: 60 }
        );

        const thumbnail = await fetch(url);

        if (!thumbnail.ok) {
            return new Response('Not found', { status: 404 });
        }

        return new Response(thumbnail.body, {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'private, max-age=3600',
            }
        });
    } catch (error) {
        console.error('Thumbnail proxy error:', error);
        return new Response('Failed to fetch thumbnail', { status: 500 });
    }
};
