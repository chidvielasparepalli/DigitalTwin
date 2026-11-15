import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import { createClient, applyMigrations, usersRepo, twinsRepo, logAudit } from '@digital-twin/db';
import { PERSONALITY_TRAITS, PROVENANCE } from '@digital-twin/shared';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { hash } from 'bcryptjs';

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
  token = await registerUser('p6@test.dev');
  const twinRes = await app.inject({
    method: 'POST',
    url: '/api/twins',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'P6 Twin', preferredLanguages: ['en'] },
  });
  twinId = twinRes.json().id;
});

afterAll(async () => {
  await app.close();
});

describe('communication style routes', () => {
  it('analyzes and stores initial style for a twin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/communication-style/analyze',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Communication style analysis initiated (placeholder)');

    const profileRes = await app.inject({
      method: 'GET',
      url: '/api/communication-style/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profileRes.statusCode).toBe(200);
    const profile = profileRes.json();
    expect(profile.length).toBeGreaterThan(0);
    expect(profile.some((p: { characteristic: string }) => p.characteristic === 'avg_message_length')).toBe(true);
  });

  it('gets the communication style profile for a twin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/communication-style/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const profile = res.json();
    expect(profile.length).toBeGreaterThan(0);
    expect(profile.every((p: { provenance: string }) => p.provenance === 'inferred')).toBe(true);
  });

  it('allows updating a communication style characteristic', async () => {
    const profileRes = await app.inject({
      method: 'GET',
      url: '/api/communication-style/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    const initialProfile = profileRes.json();
    const charToUpdate = initialProfile.find((p: { characteristic: string }) => p.characteristic === 'directness');
    expect(charToUpdate).toBeTruthy();

    const newValue = 0.9;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/communication-style/profile/${charToUpdate.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { value: newValue, provenance: 'explicit' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe(newValue);
    expect(res.json().provenance).toBe('explicit');

    // Verify it's updated in the DB
    const updatedProfileRes = await app.inject({
      method: 'GET',
      url: '/api/communication-style/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    const updatedProfile = updatedProfileRes.json();
    const found = updatedProfile.find((p: { id: string }) => p.id === charToUpdate.id);
    expect(found?.value).toBe(newValue);
    expect(found?.provenance).toBe('explicit');
  });

  it('calculates a style match score for text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/communication-style/match-score',
      headers: { authorization: `Bearer ${token}` },
      payload: { text: 'Hello, how are you? I am fine. 👍' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().score).toBeGreaterThan(0);
  });
});
