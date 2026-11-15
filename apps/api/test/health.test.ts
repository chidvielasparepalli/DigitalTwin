import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import { createClient, applyMigrations } from '@digital-twin/db';
import type { FastifyInstance } from 'fastify';

async function makeApp(): Promise<FastifyInstance> {
  const { client } = createClient(); // in-memory — no file writes in tests
  applyMigrations(client);
  const app = buildApp({ client });
  await app.ready();
  return app;
}

describe('health endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});
