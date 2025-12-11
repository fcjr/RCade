import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.ts';
import { env } from '$env/dynamic/private';

let _db: DrizzleD1Database<typeof schema> | null = null;

let DBG_ENV: any = undefined;

export async function getDb(): Promise<DrizzleD1Database<typeof schema>> {
	if (!_db) {
		if (!env.DB) {
			if (DBG_ENV == undefined) {
				const { getPlatformProxy } = await import('wrangler');
				DBG_ENV = await getPlatformProxy({ persist: { path: '.wrangler/state/v3' } });
			}

			return drizzle(DBG_ENV.env.DB, { schema });
		};
		_db = drizzle(env.DB, { schema });
	}
	return _db;
}
