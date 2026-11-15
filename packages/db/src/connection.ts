import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import * as schema from './schema';

export interface DbOptions {
  /** SQLite file path. Defaults to an in-memory database. */
  path?: string;
}

export type Db = Database.Database;
export type DrizzleClient = BetterSQLite3Database<typeof schema>;

/**
 * Opens a SQLite connection with WAL + foreign keys on.
 * In-memory databases cannot use WAL — SQLite reports 'memory' instead.
 */
export function createDb(options: DbOptions = {}): Db {
  const path = options.path ?? ':memory:';
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export interface DbClient {
  /** Raw SQLite handle (for ad-hoc SQL, pragmas, FTS later). */
  sqlite: Db;
  /** Typed Drizzle client over the full schema. */
  client: DrizzleClient;
}

/** Opens a connection and wraps it in the typed Drizzle client. */
export function createClient(options: DbOptions = {}): DbClient {
  const sqlite = createDb(options);
  return { sqlite, client: drizzle(sqlite, { schema }) };
}

const migrationsFolder = resolve(import.meta.dirname, '../drizzle');

/** Apply SQL migrations to a client (usually in-memory). Idempotent. */
export function applyMigrations(db: DrizzleClient): void {
  migrate(db, { migrationsFolder });
}
