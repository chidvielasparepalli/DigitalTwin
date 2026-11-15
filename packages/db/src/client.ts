import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createDb, type Db, type DbOptions } from './connection';
import * as schema from './schema';

export type DrizzleClient = BetterSQLite3Database<typeof schema>;

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
