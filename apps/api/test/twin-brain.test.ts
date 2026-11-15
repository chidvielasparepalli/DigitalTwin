import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import { createClient, applyMigrations, usersRepo, twinsRepo, logAudit } from '@digital-twin/db';
import { PERSONALITY_TRAITS, PROVENANCE } from '@digital-twin/shared';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { hash } from 'bcryptjs';
import * as schema from '@digital-twin/db'; // Import schema to use it for memories

let app: FastifyInstance;
let token: string;
let twinId: string;

async function registerUser(email: string): Promise<string> {
  const passwordHash = await hash('password123', 10);
  const user = usersRepo.create(app.db, { email, name: 'Test User', passwordHash });
  return app.jwt.sign({ sub: user.id });
}

beforeAll(async () => {
  const { client } = createClient();
  applyMigrations(client);
  app = buildApp({ client });
  await app.ready();
  token = await registerUser('p8@test.dev');
  const twinRes = await app.inject({
    method: 'POST',
    url: '/api/twins',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'P8 Twin', preferredLanguages: ['en'] },
  });
  twinId = twinRes.json().id;

  // Infer some personality traits and communication styles for the twin
  await app.inject({
    method: 'POST',
    url: '/api/personality/infer',
    headers: { authorization: `Bearer ${token}` },
  });
  await app.inject({
    method: 'POST',
    url: '/api/communication-style/analyze',
    headers: { authorization: `Bearer ${token}` },
  });

  // Create some dummy memories and KG data
  app.db.insert(schema.memories).values({
    id: crypto.randomUUID(), twinId, type: 'episodic', content: 'I had coffee today.',
    importance: 0.5, confidence: 0.9, provenance: PROVENANCE.EXPLICIT, createdAt: new Date(), updatedAt: new Date()
  }).run();
  app.db.insert(schema.memories).values({
    id: crypto.randomUUID(), twinId, type: 'semantic', content: 'Node.js is a runtime environment.',
    importance: 0.7, confidence: 0.8, provenance: PROVENANCE.EXPLICIT, createdAt: new Date(), updatedAt: new Date()
  }).run();

  // Create KG entity for the twin itself (needed for relationships where twin is source)
  const twinKgEntityRes = await app.inject({
    method: 'POST',
    url: '/api/kg/entity',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'P8 Twin', type: 'PERSON' },
  });
  const twinKgEntityId = twinKgEntityRes.json().id;

  const coffeeEntityRes = await app.inject({
    method: 'POST',
    url: '/api/kg/entity',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Coffee', type: 'PREFERENCE' },
  });
  const coffeeEntityId = coffeeEntityRes.json().id;

  await app.inject({
    method: 'POST',
    url: '/api/kg/relationship',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      sourceEntityId: twinKgEntityId, // Twin KgEntity is the source
      targetEntityId: coffeeEntityId,
      type: 'PREFERS',
      description: 'The twin prefers coffee',
    },
  });
});

afterAll(async () => {
  await app.close();
});

describe('twin brain routes', () => {
  it('processes user input and returns a response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/twin-brain/process',
      headers: { authorization: `Bearer ${token}` },
      payload: { query: 'What did I have today?' },
    });
    expect(res.statusCode).toBe(200);
    const output = res.json();
    expect(output.response).toBeTypeOf('string');
    expect(output.explanation).toBeTypeOf('string');
    expect(output.confidence).toBeGreaterThan(0);
    expect(output.relevantMemories.length).toBeGreaterThan(0);
    expect(output.relevantPersonalityTraits.length).toBe(PERSONALITY_TRAITS.length);
    expect(output.relevantCommunicationStyle.length).toBeGreaterThan(0);
    expect(output.relevantKgEntities.length).toBeGreaterThanOrEqual(1); // Should have at least the coffee entity
    expect(output.relevantKgRelationships.length).toBeGreaterThanOrEqual(1); // Should have at least the PREFERS relationship
  });

  it('handles queries that should result in unknown information', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/twin-brain/process',
      headers: { authorization: `Bearer ${token}` },
      payload: { query: 'What did I eat for dinner last year on July 4th?' },
    });
    expect(res.statusCode).toBe(200);
    const output = res.json();
    expect(output.response).toContain('don\'t know'); // Expect the twin to state it doesn't know
  });

  it('requires an API key for the AI provider', async () => {
    // Create a new app instance without an API key
    const noApiKeyApp = buildApp({ config: { host: '127.0.0.1', port: 4001, corsOrigin: 'http://localhost:5173', databasePath: ':memory:', jwtSecret: 'temp', openaiApiKey: '' } });
    await noApiKeyApp.ready();
    const tempToken = await registerUser('noai@test.dev');
    const res = await noApiKeyApp.inject({
      method: 'POST',
      url: '/api/twin-brain/process',
      headers: { authorization: `Bearer ${tempToken}` },
      payload: { query: 'test' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toContain('AI provider not configured');
    await noApiKeyApp.close();
  });
});