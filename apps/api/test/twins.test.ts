import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import { createClient, applyMigrations } from '@digital-twin/db';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let token: string;

async function registerUser(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, name: 'Demo', password: 'password123' },
  });
  return res.json().token as string;
}

beforeAll(async () => {
  const { client } = createClient();
  applyMigrations(client);
  app = buildApp({ client });
  await app.ready();
  token = await registerUser('twin@test.dev');
});

afterAll(async () => {
  await app.close();
});

describe('twin onboarding', () => {
  it('creates a twin with onboarding data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/twins',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Arvi',
        preferredName: 'A',
        occupation: 'Engineer',
        communicationStyle: 'direct',
        values: 'family, honesty',
        interests: 'cooking',
        likes: ['coffee', 'mornings'],
        dislikes: ['loud noises'],
        relationships: [{ name: 'Ananya', relationType: 'sister' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const twin = res.json();
    expect(twin.name).toBe('Arvi');
    expect(twin.occupation).toBe('Engineer');
  });

  it('rejects duplicate twin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/twins',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Another' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('requires name', async () => {
    const t2 = await registerUser('noname@test.dev');
    const res = await app.inject({
      method: 'POST',
      url: '/api/twins',
      headers: { authorization: `Bearer ${t2}` },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('gets own twin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/twins/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Arvi');
  });

  it('lists default permissions', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/twins/permissions', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().some((p: { action: string }) => p.action === 'calendar.read')).toBe(true);
  });

  it('updates a permission level', async () => {
    const perms = (await app.inject({ method: 'GET', url: '/api/twins/permissions', headers: { authorization: `Bearer ${token}` } })).json();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/twins/permissions/${perms[0].id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { level: 'suggest' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('blocks twin creation without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/twins', payload: { name: 'X' } });
    expect(res.statusCode).toBe(401);
  });
});
