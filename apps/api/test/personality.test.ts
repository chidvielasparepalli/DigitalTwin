import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import { createClient, applyMigrations, usersRepo, twinsRepo, logAudit } from '@digital-twin/db';
import { PERSONALITY_TRAITS } from '@digital-twin/shared';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';

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
  token = await registerUser('p5@test.dev');
  const twinRes = await app.inject({
    method: 'POST',
    url: '/api/twins',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'P5 Twin', preferredLanguages: ['en'] },
  });
  twinId = twinRes.json().id;
});

afterAll(async () => {
  await app.close();
});

describe('personality routes', () => {
  it('infers initial traits for a twin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/personality/infer',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Inference process initiated (placeholder)');

    const traitsRes = await app.inject({
      method: 'GET',
      url: '/api/personality/traits',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(traitsRes.statusCode).toBe(200);
    const traits = traitsRes.json();
    expect(traits.length).toBe(PERSONALITY_TRAITS.length);
    expect(traits.every((t: { provenance: string }) => t.provenance === 'inferred')).toBe(true);
  });

  it('gets all traits for a twin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/personality/traits',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const traits = res.json();
    expect(traits.length).toBeGreaterThan(0);
  });

  it('allows updating a trait', async () => {
    const traitsRes = await app.inject({
      method: 'GET',
      url: '/api/personality/traits',
      headers: { authorization: `Bearer ${token}` },
    });
    const initialTraits = traitsRes.json();
    const traitToUpdate = initialTraits[0];

    const newConfidence = 0.95;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/personality/traits/${traitToUpdate.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { confidence: newConfidence, provenance: 'explicit' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().confidence).toBe(newConfidence);
    expect(res.json().provenance).toBe('explicit');

    // Verify it's updated in the DB
    const updatedTraitsRes = await app.inject({
      method: 'GET',
      url: '/api/personality/traits',
      headers: { authorization: `Bearer ${token}` },
    });
    const updatedTraits = updatedTraitsRes.json();
    const found = updatedTraits.find((t: { id: string }) => t.id === traitToUpdate.id);
    expect(found?.confidence).toBe(newConfidence);
  });

  it('rejects update with invalid trait ID', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/personality/traits/${randomUUID()}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { confidence: 0.8 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects updates without any body', async () => {
    const traitsRes = await app.inject({
      method: 'GET',
      url: '/api/personality/traits',
      headers: { authorization: `Bearer ${token}` },
    });
    const traitToUpdate = traitsRes.json()[0];
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/personality/traits/${traitToUpdate.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
