// See https://svelte.dev/docs/kit/types#app.d.ts

import type { Session } from "$lib/auth/user";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

import { type DefaultSession } from "@auth/sveltekit";
import type { DefaultJWT } from "@auth/core/jwt";

declare module "@auth/sveltekit" {
	interface Session {
		user: {
			rc_id: string,
			github?: string,
		} & DefaultSession["user"]
	}
}

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: Session,
		}
		// interface PageData {}
		interface Platform {
			env: {
				DB: D1Database;
				STORE: R2Bucket;
				AUTH_SECRET: string,
				RC_CLIENT_ID: string,
				RC_CLIENT_SECRET: string,
				RC_PAT: string,
				BUCKET_S3_ENDPOINT: string,
				BUCKET_TOKEN: string,
				BUCKET_ACCESS_KEY: string,
				BUCKET_ACCESS_KEY_SECRET: string,
			};
			context: {
				waitUntil(promise: Promise<any>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}
}

export { };