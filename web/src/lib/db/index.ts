import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.ts';
import { env } from '$env/dynamic/private';

let _db: DrizzleD1Database<typeof schema> | null = null;

export function getDb(): DrizzleD1Database<typeof schema> {
	if (!_db) {
		if (!env.DB) throw new Error('DB is not set');
		_db = drizzle(env.DB, { schema });
	}
	return _db;
}
