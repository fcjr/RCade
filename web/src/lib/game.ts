import { and, eq, inArray, type InferSelectModel } from "drizzle-orm";
import { getDb } from "./db";
import { categories, gameAuthors, gameDependencies, games, gameVersionCategories, gameVersions } from "./db/schema";
import type { GithubOIDCClaims } from "./auth/github";
import * as z from "zod";
import { GameManifest } from "@rcade/api";
import type { R2Bucket } from "@cloudflare/workers-types";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "$env/dynamic/private";
import type { RecurseResponse } from "./rc_oauth";
import semver from "semver";

export enum GitUrlKind {
    Https,
    Ssh,
}

const S3 = new S3Client({
    region: "auto",
    endpoint: env.BUCKET_S3_ENDPOINT!,
    credentials: {
        accessKeyId: env.BUCKET_ACCESS_KEY!,
        secretAccessKey: env.BUCKET_ACCESS_KEY_SECRET!,
    },
});

export class Game {
    public static async all(): Promise<Game[]> {
        return (await getDb().query.games.findMany({ with: { versions: { with: { authors: true, dependencies: true, categories: { with: { category: true } }, remixOf: { with: { game: true } } } } } }))
            .map(game => new Game(game));
    }

    public static async byId(id: string): Promise<Game | undefined> {
        let v = await getDb().query.games.findFirst({ with: { versions: { with: { authors: true, dependencies: true, categories: { with: { category: true } }, remixOf: { with: { game: true } } } } }, where: eq(games.id, id) });

        if (v === undefined) {
            return undefined;
        }

        return new Game(v);
    }

    public static async byName(name: string): Promise<Game | undefined> {
        let v = await getDb().query.games.findFirst({ with: { versions: { with: { authors: true, dependencies: true, categories: { with: { category: true } }, remixOf: { with: { game: true } } } } }, where: eq(games.name, name) });

        if (v === undefined) {
            return undefined;
        }

        return new Game(v);
    }

    public static async new(name: string, pushInfo: GithubOIDCClaims & { recurser: RecurseResponse }): Promise<Game> {
        const result = await getDb().insert(games).values({
            name,
            github_author: pushInfo.repository_owner,
            github_repo: pushInfo.repository,
            owner_rc_id: pushInfo.recurser.id.toString(),
        }).returning();

        return new Game({
            ...result[0],
            versions: [],
        });
    }

    private constructor(private data: InferSelectModel<typeof games> & {
        versions: (InferSelectModel<typeof gameVersions> & {
            authors: InferSelectModel<typeof gameAuthors>[],
            dependencies: InferSelectModel<typeof gameDependencies>[],
            remixOf: (InferSelectModel<typeof gameVersions> & {
                game: InferSelectModel<typeof games>,
            }) | null,
            categories: (InferSelectModel<typeof gameVersionCategories> & { category: InferSelectModel<typeof categories> })[],
        })[]
    }) { }

    public async publishVersion(version: string, manifest: z.infer<typeof GameManifest>): Promise<{ upload_url: string, expires: number }> {
        if (manifest.version !== undefined && manifest.version !== version) {
            throw new Error("Version mismatch");
        }

        const remixOf = manifest.remix_of;
        const isFirstVersion = this.data.versions.length === 0;

        if (!isFirstVersion) {
            await this.validateRemixConsistency(remixOf);
        }

        let remixOfGameId: string | null = null;
        let remixOfVersion: string | null = null;

        if (remixOf) {
            const remixData = await this.parseAndValidateRemix(manifest, remixOf, isFirstVersion);
            remixOfGameId = remixData.gameId;
            remixOfVersion = remixData.version;
        }

        await getDb().insert(gameVersions).values({
            gameId: this.data.id,
            version,
            displayName: manifest.display_name,
            description: manifest.description,
            visibility: manifest.visibility,
            status: "pending",
            remixOfGameId,
            remixOfVersion,
        });

        const authors = Array.isArray(manifest.authors) ? manifest.authors : [manifest.authors];

        await getDb().insert(gameAuthors).values(authors.map(author => ({
            gameId: this.data.id,
            gameVersion: version,
            display_name: author.display_name,
            recurse_id: author.recurse_id
        })));

        if (manifest.categories && manifest.categories.length > 0) {
            const categoryRecords = await getDb()
                .select()
                .from(categories)
                .where(inArray(categories.name, manifest.categories));

            const categoryMap = new Map(
                categoryRecords.map(cat => [cat.name, cat.id])
            );

            const validCategories = manifest.categories
                .filter(name => categoryMap.has(name))
                .map(name => ({
                    gameId: this.data.id,
                    gameVersion: version,
                    categoryId: categoryMap.get(name)!
                }));

            if (validCategories.length > 0) {
                await getDb().insert(gameVersionCategories).values(validCategories);
            }

            const invalidCategories = manifest.categories.filter(name => !categoryMap.has(name));
            if (invalidCategories.length > 0) {
                console.warn(`Invalid categories found: ${invalidCategories.join(', ')}`);
            }
        }

        if (manifest.dependencies && manifest.dependencies.length > 0) {
            await getDb().insert(gameDependencies).values(manifest.dependencies.map(dependency => ({
                gameId: this.data.id,
                gameVersion: version,
                dependencyName: dependency.name,
                dependencyVersion: dependency.version,
            })));
        }

        const upload_url = await getSignedUrl(
            S3,
            new PutObjectCommand({ Bucket: "rcade", Key: `games/builds/${this.data.id}/${version}.tar.gz` }),
            { expiresIn: 3600 }
        );

        return { upload_url, expires: (Date.now() + 3600) }
    }

    private async validateRemixConsistency(remixOf: {
        name: string;
        version: string;
    } | undefined): Promise<void> {
        const existingVersions = this.data.versions;

        if (existingVersions.length === 0) {
            return;
        }

        const existingRemix = existingVersions.find(v => v.remixOf !== null);

        if (!remixOf && existingRemix) {
            throw new Error(
                `Cannot publish version without remix: previous versions remix game '${existingRemix.remixOf!.game.name}@${existingRemix.remixOf!.version}'. ` +
                `All versions must remix the same game.`
            );
        }

        if (remixOf && !existingRemix) {
            throw new Error(
                `Cannot publish version with remix: previous versions do not remix any game. ` +
                `All versions must be consistent (either all remix or none remix).`
            );
        }

        if (remixOf && existingRemix) {
            const existingRemixGameName = existingRemix.remixOf!.game.name;

            if (remixOf.name !== existingRemixGameName) {
                throw new Error(
                    `Cannot change remix target: previous versions remix game '${existingRemix.remixOf!.game.name}@${existingRemix.remixOf!.version}'. ` +
                    `All versions must remix the same game.`
                );
            }
        }
    }

    private async parseAndValidateRemix(
        self: z.infer<typeof GameManifest>,
        remixOf: {
            name: string;
            version: string;
        },
        isFirstVersion: boolean
    ): Promise<{ gameId: string, version: string }> {
        const targetGame = await getDb()
            .select()
            .from(games)
            .where(eq(games.name, remixOf.name))
            .limit(1);

        if (targetGame.length === 0) {
            throw new Error(
                `Remix target game not found: no game with name '${remixOf.name}' exists`
            );
        }

        const gameId = targetGame[0].id;

        const remixTarget = await getDb().query.gameVersions.findFirst({
            where: (gameVersions, { and, eq }) =>
                and(
                    eq(gameVersions.gameId, gameId),
                    eq(gameVersions.version, remixOf.version)
                ),
            with: {
                game: true
            }
        });

        if (remixTarget == undefined) {
            throw new Error(
                `Remix target not found: game '${remixOf.name}' version '${remixOf.version}' does not exist`
            );
        }

        if (remixTarget.status !== "published") {
            throw new Error(
                `Cannot remix unpublished version`
            );
        }

        if (remixTarget.visibility === "private") {
            if (self.visibility !== "private") {
                throw new Error(
                    `Remix visibility must be <= target visibility. In this case, the target has visibility 'private', so your remix must be 'private'`
                );
            }

            if (this.data.owner_rc_id !== remixTarget.game.owner_rc_id) {
                throw new Error(
                    `Cannot remix an private game owned by somebody else.`
                );
            }
        }

        if (remixTarget.visibility === "internal") {
            if (self.visibility === "public") {
                throw new Error(
                    `Remix visibility must be <= target visibility. In this case, the target has visibility 'private', so your remix must be 'private' | 'internal'`
                );
            }
        }

        if (!isFirstVersion) {
            const existingVersionsWithRemix = this.data.versions.filter(v => v.remixOf !== null);

            if (existingVersionsWithRemix.length > 0) {
                const latestRemixedVersion = existingVersionsWithRemix
                    .map(v => v.remixOf!.version)
                    .sort((a, b) => semver.rcompare(a, b))[0];

                if (semver.lt(remixOf.version, latestRemixedVersion)) {
                    throw new Error(
                        `Cannot remix older version: attempting to remix version '${remixOf.version}', ` +
                        `but previous versions remix up to '${latestRemixedVersion}'. ` +
                        `New versions must remix the same or newer version.`
                    );
                }
            }
        }

        return { gameId, version: remixOf.version };
    }

    public gitUrl(kind: GitUrlKind = GitUrlKind.Https) {
        switch (kind) {
            case GitUrlKind.Https: return `https://github.com/${this.data.github_repo}`
            case GitUrlKind.Ssh: return `git@github.com:${this.data.github_repo}.git`
        }
    }

    public async intoResponse(auth: { for: "recurser", rc_id: string } | { for: "public" } | { for: "cabinet" }, config: { withR2Key: boolean } = { withR2Key: false }): Promise<object | undefined> {
        const versions = (await Promise.all(this.data.versions.map(async version => {
            if (version.status !== "published") {
                return undefined;
            }

            if (version.visibility !== "public") {
                if (auth.for === "public") return undefined;

                if (
                    version.visibility === "private" &&
                    auth.for === "recurser" &&
                    auth.rc_id !== this.data.owner_rc_id
                ) {
                    return undefined;
                }
            }

            if (version.visibility === "private" && auth.for === "cabinet") {
                return undefined;
            }

            const r2Key: Record<string, any> = {};

            if (config.withR2Key) {
                r2Key["contents"] = {
                    url: await getSignedUrl(
                        S3,
                        new GetObjectCommand({ Bucket: "rcade", Key: `games/builds/${this.data.id}/${version.version}.tar.gz` }),
                        { expiresIn: 3600 }
                    ),
                    expires: Date.now() + (3600 * 1000),
                };
            }

            return {
                displayName: version.displayName,
                description: version.description,
                visibility: version.visibility,
                version: version.version,
                authors: version.authors.map(v => ({ display_name: v.display_name, recurse_id: v.recurse_id })),
                dependencies: version.dependencies.map(v => ({ name: v.dependencyName, version: v.dependencyVersion })),
                categories: version.categories.map(v => v.category.name),
                remixOf: version.remixOf == null ? undefined : {
                    id: version.remixOf.game.id,
                    name: version.remixOf.game.name,
                    git: {
                        ssh: `git@github.com:${version.remixOf.game.github_repo}.git`,
                        https: `https://github.com/${version.remixOf.game.github_repo}`,
                    },
                    owner_rc_id: version.remixOf.game.owner_rc_id,
                    version: {
                        displayName: version.remixOf.displayName,
                        description: version.remixOf.description,
                        visibility: version.remixOf.visibility,
                        version: version.remixOf.version,
                        remixOf: version.remixOf.remixOfGameId == null ? undefined : {
                            id: version.remixOf.remixOfGameId,
                            version: {
                                version: version.remixOf.remixOfVersion!,
                            }
                        }
                    },
                },
                ...r2Key,
            }
        }))).filter(v => v !== undefined);

        if (versions.length == 0) {
            return undefined;
        }

        return {
            id: this.data.id,
            name: this.data.name,
            git: {
                ssh: `git@github.com:${this.data.github_repo}.git`,
                https: `https://github.com/${this.data.github_repo}`,
            },
            owner_rc_id: this.data.owner_rc_id,
            versions,
        }
    }

    public latestVersionNumber() {
        return semver.sort(this.data.versions.map(v => v.version)).pop()
    }

    public version(version: string) {
        return this.data.versions.find(v => v.version == version);
    }

    public matchesRepo(repo: string): boolean {
        return this.data.github_repo === repo;
    }

    public async setVersionStatus(version: string, status: "pending" | "published"): Promise<boolean> {
        const result = await getDb()
            .update(gameVersions)
            .set({ status })
            .where(and(
                eq(gameVersions.gameId, this.data.id),
                eq(gameVersions.version, version)
            ))
            .returning();

        return result.length > 0;
    }
}
