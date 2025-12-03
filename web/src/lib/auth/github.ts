import * as z from "zod";
import * as jose from "jose";
import type { RecurseResponse } from "$lib/rc_oauth";
import { RecurseAPI } from "$lib/recurse";
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

    public async validate(jwt: string): Promise<GithubOIDCClaims & { recurser: RecurseResponse }> {
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
        const recurser = await this.rcClient.getUserByGithubId(claims.repository_owner);

        return {
            ...claims,
            recurser,
        };
    }
}
