import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import type { DrizzleClient } from './client';

export const migrationsFolder = resolve(import.meta.dirname, '../drizzle');

/** Apply SQL migrations to a client (usually in-memory). Idempotent. */
export function applyMigrations(db: DrizzleClient): void {
  migrate(db, { migrationsFolder });
}
