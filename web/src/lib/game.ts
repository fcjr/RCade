import { eq, type InferSelectModel } from "drizzle-orm";
import { getDb } from "./db";
import { gameAuthors, games, gameVersions } from "./db/schema";
import type { GithubOIDCClaims } from "./auth/github";
import * as z from "zod";
import { Manifest } from "./manifest";
import type { R2Bucket } from "@cloudflare/workers-types";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "$env/dynamic/private";

export enum GitUrlKind {
    Https,
    Ssh,
}

export class Game {
    public static async all(): Promise<Game[]> {
        return (await getDb().query.games.findMany({ with: { versions: { with: { authors: true } } } }))
            .map(game => new Game(game));
    }

    public static async byId(id: string): Promise<Game | undefined> {
        let v = await getDb().query.games.findFirst({ with: { versions: { with: { authors: true } } }, where: eq(games.id, id) });

        if (v === undefined) {
            return undefined;
        }

        return new Game(v);
    }

    public static async byName(name: string): Promise<Game | undefined> {
        let v = await getDb().query.games.findFirst({ with: { versions: { with: { authors: true } } }, where: eq(games.name, name) });

        if (v === undefined) {
            return undefined;
        }

        return new Game(v);
    }

    public static async new(name: string, pushInfo: GithubOIDCClaims): Promise<Game> {
        const result = await getDb().insert(games).values({
            name: name,

            github_author: pushInfo.repository_owner,
            github_repo: pushInfo.repository,

            owner_rc_id: "0", // TODO
        }).returning();

        return new Game({
            ...result[0],
            versions: [],
        });
    }

    private constructor(private data: InferSelectModel<typeof games> & { versions: (InferSelectModel<typeof gameVersions> & { authors: InferSelectModel<typeof gameAuthors>[] })[] }) { }

    public async publishVersion(manifest: z.infer<typeof Manifest>): Promise<{ upload_url: string }> {
        const version = manifest.version as string | undefined ?? "1.0.0";

        await getDb().insert(gameVersions).values({
            gameId: this.data.id,
            version,

            description: manifest.description,
            visibility: manifest.visibility,
        });

        const authors = Array.isArray(manifest.authors) ? manifest.authors : [manifest.authors];

        await getDb().insert(gameAuthors).values(authors.map(author => ({
            gameId: this.data.id,
            gameVersion: version,

            display_name: author.display_name,
            recurse_id: author.recurse_id
        })));

        const upload_url = await getSignedUrl(
            new S3Client({
                region: "auto",
                endpoint: env.BUCKET_S3_ENDPOINT!,
                credentials: {
                    accessKeyId: env.BUCKET_ACCESS_KEY!,
                    secretAccessKey: env.BUCKET_ACECSS_KEY_SECRET!,
                },
            }),
            new PutObjectCommand({ Bucket: "rcade", Key: `/games/builds/${manifest.version}.tar.gz` }),
            { expiresIn: 3600 }
        );

        return { upload_url }
    }

    public gitUrl(kind: GitUrlKind = GitUrlKind.Https) {
        switch (kind) {
            case GitUrlKind.Https: `https://github.com/${this.data.github_author}/${this.data.github_repo}`
            case GitUrlKind.Ssh: `git@github.com:${this.data.github_author}/${this.data.github_repo}.git`
        }
    }

    public intoResponse(auth: { for: "recurser", rc_id: string } | { for: "public" }): object | undefined {
        const versions = this.data.versions.map(version => {
            if (version.visibility !== "public") {
                if (auth.for === "public" || auth.rc_id !== this.data.owner_rc_id)
                    return undefined;
            }

            return {
                description: version.description,
                visibility: version.visibility,
                authors: version.authors,
            }
        });

        if (versions.length == 0) {
            return undefined;
        }

        return {
            id: this.data.id,
            name: this.data.name,
            git: {
                ssh: this.gitUrl(GitUrlKind.Ssh),
                https: this.gitUrl(GitUrlKind.Https),
            },
            owner_rc_id: this.data.owner_rc_id,
            versions,
        }
    }
}