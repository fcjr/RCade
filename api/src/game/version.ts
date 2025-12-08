import type { Permission } from "./manifest.js";

export class GameVersion {
    public static fromApiResponse(game_id: string, response: any) {
        return new GameVersion(game_id, response);
    }

    private constructor(
        private game_id: string,
        private apiResponse: any
    ) { }

    public version(): string {
        return this.apiResponse.version as string;
    }

    public contentUrl(): string | undefined {
        if (!("contents" in this.apiResponse))
            return undefined

        const now = Date.now();

        if (now > this.apiResponse.contents.expires)
            return undefined;

        return this.apiResponse.contents.url
    }

    public dependencies(): { name: string, version: string }[] {
        return this.apiResponse.dependencies;
    }

    public authors(): { display_name: string, recurse_id?: number | null }[] {
        return this.apiResponse.authors;
    }

    public displayName(): string | null | undefined {
        return this.apiResponse.displayName;
    }

    public permissions(): Permission[] {
        return this.apiResponse.permissions ?? [];
    }
}