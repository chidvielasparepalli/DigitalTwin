import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { createClient, type DrizzleClient } from '@digital-twin/db';
import { loadConfig, type ServerConfig } from './config';
import { registerAuth } from './auth';
import { registerTwins } from './twins';
import { registerSources } from './sources';
import { registerMemory } from './memory';
import { registerPersonality } from './personality';
import { registerCommunicationStyle } from './communication-style';
import { registerKnowledgeGraph } from './kg';
import { registerTwinBrain } from './twin-brain';

declare module 'fastify' {
  interface FastifyInstance {
    /** Typed Drizzle client (routes use this for all data access). */
    db: DrizzleClient;
  }
}

export interface AppDeps {
  config?: ServerConfig;
  /** Typed Drizzle client. Defaults to a client on config.databasePath. */
  client?: DrizzleClient;
}

/** Builds the Fastify application. Injectable client for tests. */
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const config = deps.config ?? loadConfig();
  const client = deps.client ?? createClient({ path: config.databasePath }).client;

  const app = Fastify({ logger: true });

  app.register(cors, { origin: config.corsOrigin });
  app.register(jwt, { secret: config.jwtSecret });
  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

  app.decorate('db', client);

  app.register(async (api) => {
    registerAuth(api, client);
    registerTwins(api, client);
    registerSources(api, client);
    registerMemory(api, client);
    registerPersonality(api, client);
    registerCommunicationStyle(api, client);
    registerKnowledgeGraph(api, client);
    registerTwinBrain(api, client);
  });

  // All API routes live under /api so the Vite proxy can forward requests
  // verbatim (no URL rewrite) and the browser stays on relative paths.
  app.get('/api/health', async () => ({
    status: 'ok',
    app: 'digital-twin',
    ts: new Date().toISOString(),
  }));

  return app;
}
