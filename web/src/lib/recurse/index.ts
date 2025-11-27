import * as z from 'zod';

import { RecurseResponse } from "$lib/rc_oauth";

const RECURSE_API_BASE_URL = "https://www.recurse.com/api/v1";

const GetProfilesResponse = z.array(RecurseResponse);

export class RecurseAPIError extends Error {
    constructor(
        message: string,
        public readonly code: 'USER_NOT_FOUND' | 'MULTIPLE_USERS' | 'API_ERROR',
        public readonly statusCode: number = 500
    ) {
        super(message);
        this.name = 'RecurseAPIError';
    }
}

export class RecurseAPI {
    private pat: string;

    public constructor(pat: string) {
        this.pat = pat;
    }

    public async getUserByGithubId(githubId: string): Promise<RecurseResponse> {
        const res = await fetch(`${RECURSE_API_BASE_URL}/profiles?query=${githubId}`, {
            headers: {
                'Authorization': `Bearer ${this.pat}`
            }
        });
        if (!res.ok) {
            throw new RecurseAPIError(
                `Failed to fetch user by github id: ${res.statusText}`,
                'API_ERROR',
                502
            );
        }
        const body = await res.json();

        const profiles = GetProfilesResponse.parse(body).filter((profile) => profile.github === githubId);
        if (profiles.length === 0) {
            throw new RecurseAPIError(
                `No user found with github id: ${githubId}. Did you add your GitHub username to your Recurse profile?`,
                'USER_NOT_FOUND',
                403
            );
        }
        if (profiles.length > 1) {
            throw new RecurseAPIError(
                `Multiple users found with github id: ${githubId}. Contact an admin for help.`,
                'MULTIPLE_USERS',
                403
            );
        }
        return profiles[0];
    }
}