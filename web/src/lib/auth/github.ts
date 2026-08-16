import * as z from "zod";
import * as jose from "jose";
import type { RecurseResponse } from "$lib/rc_oauth";
import { RecurseAPI, RecurseAPIError } from "$lib/recurse";
import { isEventAuthenticated } from "$lib/event";
import { env } from "$env/dynamic/private"

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URI = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
const ACTION_AUDIENCE = "https://rcade.dev";

const GithubOIDCClaims = z.object({
    iss: z.string().nonempty(),
    aud: z.string().nonempty(),
    sub: z.string().nonempty(),
    repository: z.string().nonempty(),
    repository_owner: z.string().nonempty(),
    repository_owner_id: z.string().nonempty(),
    repository_visibility: z.enum(["public", "private", "internal"]),
    actor: z.string().nonempty(),
    actor_id: z.string().nonempty(),
    ref: z.string().nonempty(),
    sha: z.string().nonempty(),
    workflow: z.string().nonempty(),
    run_id: z.string().nonempty(),
    run_number: z.string().nonempty(),
    run_attempt: z.string().nonempty(),
    iat: z.number(),
    exp: z.number(),
    nbf: z.number(),
});

export type GithubOIDCClaims = z.infer<typeof GithubOIDCClaims>;

export class GithubOIDCValidator {
    private rcClient: RecurseAPI;
    private jwks: ReturnType<typeof jose.createRemoteJWKSet>;
    private extra_jwks: ReturnType<typeof jose.createLocalJWKSet> | undefined; 

    public constructor() {
        this.rcClient = new RecurseAPI(env.RC_PAT!);
        this.jwks = jose.createRemoteJWKSet(new URL(GITHUB_OIDC_JWKS_URI));

        if (env.RSA_PUBLIC_KEY_JWK) {
            this.extra_jwks = jose.createLocalJWKSet({
                keys: [JSON.parse(env.RSA_PUBLIC_KEY_JWK)]
            })
        }
    }

    public async validate(jwt: string): Promise<GithubOIDCClaims & { recurser: RecurseResponse | null }> {
        let payload;

        if ("DEBUG_DISABLE_DEPLOYMENT_VALIDATION" in env && env.DEBUG_DISABLE_DEPLOYMENT_VALIDATION == "true") {
            payload = JSON.parse(atob(jwt.split(".")[1]));
        } else {
            const res = await jose.jwtVerify(jwt, this.jwks, {
							issuer: GITHUB_OIDC_ISSUER,
							audience: ACTION_AUDIENCE,
							// TODO more validation?
						});

            payload = res.payload;
        }

        const claims = GithubOIDCClaims.parse(payload);

        let recurser: RecurseResponse | null;
        try {
            recurser = await this.rcClient.getUserByGithubId(claims.repository_owner);
        } catch (error) {
            // Users registered for a currently-active event may deploy without a
            // Recurse profile. Only the not-found case falls back; ambiguous or
            // failed lookups stay fatal.
            if (!(error instanceof RecurseAPIError) || error.code !== 'USER_NOT_FOUND') {
                throw error;
            }

            if (!(await isEventAuthenticated(claims.repository_owner, new Date()))) {
                throw new RecurseAPIError(
                    `${error.message} If you're at an rcade event, run ` +
                    `\`rcade register <your-github-username> <code>\` with the code shown ` +
                    `on the cabinet, then re-run this deploy.`,
                    'USER_NOT_FOUND',
                    403,
                );
            }

            recurser = null;
        }

        return {
            ...claims,
            recurser,
        };
    }
}
