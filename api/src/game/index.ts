import semver from "semver";
import { GameVersion } from "./version.js";

export class Game {
    public static fromApiResponse(response: any) {
        return new Game(response);
    }

    private constructor(
        private apiResponse: any
    ) {
        this._versions = (apiResponse.versions as any[]).map(version => GameVersion.fromApiResponse(this.id(), version));
    }

    private _versions: GameVersion[];

    public name(): string {
        return this.apiResponse.name;
    }

    public id(): string {
        return this.apiResponse.id;
    }

    public versions(): GameVersion[] {
        return this._versions;
    }

    public lockReason(): string | undefined {
        return this.apiResponse.admin_lock_reason;
    }

    public latest(): GameVersion {
        const latest = semver.sort(this._versions.map(v => v.version())).pop()!;

        return this._versions.find(v => v.version() == latest)!;
    }

    public gitHttps(): string {
        return this.apiResponse.git.https;
    }

    public gitSsh(): string {
        return this.apiResponse.git.ssh;
    }

    public intoApiResponse(): any {
        return this.apiResponse;
    }
}