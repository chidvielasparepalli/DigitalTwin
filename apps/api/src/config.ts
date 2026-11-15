import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Server configuration from environment with sensible dev defaults. */
export interface ServerConfig {
  host: string;
  port: number;
  corsOrigin: string | string[];
  databasePath: string;
  jwtSecret: string;
  openaiApiKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 4000),
    corsOrigin: (env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
    // Shared with the db package's seed. Resolved from repo root via this file's location.
    databasePath:
      env.DATABASE_PATH ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../packages/db/data/twin.db'),
    jwtSecret: env.JWT_SECRET ?? 'dev-secret-change-me',
    openaiApiKey: env.OPENAI_API_KEY,
  };
}
