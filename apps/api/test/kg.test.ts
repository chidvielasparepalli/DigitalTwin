import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import { createClient, applyMigrations, usersRepo, twinsRepo } from '@digital-twin/db';
import { PROVENANCE } from '@digital-twin/shared';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { hash } from 'bcryptjs';

let app: FastifyInstance;
let token: string;
let twinId: string;
let personEntityId: string;
let projectEntityId: string;

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
  token = await registerUser('p7@test.dev');
  const twinRes = await app.inject({
    method: 'POST',
    url: '/api/twins',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'P7 Twin', preferredLanguages: ['en'] },
  });
  twinId = twinRes.json().id;
});

afterAll(async () => {
  await app.close();
});

describe('knowledge graph routes', () => {
  it('creates a KG entity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/kg/entity',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Alice', type: 'PERSON', description: 'A test user' },
    });
    expect(res.statusCode).toBe(201);
    const entity = res.json();
    expect(entity.name).toBe('Alice');
    expect(entity.type).toBe('PERSON');
    expect(entity.provenance).toBe(PROVENANCE.EXPLICIT);
    personEntityId = entity.id;

    const projectRes = await app.inject({
      method: 'POST',
      url: '/api/kg/entity',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Digital Twin Project', type: 'PROJECT' },
    });
    expect(projectRes.statusCode).toBe(201);
    projectEntityId = projectRes.json().id;
  });

  it('gets all KG entities', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/kg/entities',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const entities = res.json();
    expect(entities.length).toBe(2); // Alice and Project
  });

  it('creates a KG relationship', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/kg/relationship',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sourceEntityId: personEntityId,
        targetEntityId: projectEntityId,
        type: 'WORKED_ON',
        description: 'Alice worked on this project',
      },
    });
    expect(res.statusCode).toBe(201);
    const relationship = res.json();
    expect(relationship.type).toBe('WORKED_ON');
    expect(relationship.provenance).toBe(PROVENANCE.EXPLICIT);
  });

  it('gets all KG relationships', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/kg/relationships',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const relationships = res.json();
    expect(relationships.length).toBe(1);
  });

  it('gets connected graph for an entity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/kg/entity/${personEntityId}/connected`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const graph = res.json();
    expect(graph.entity.id).toBe(personEntityId);
    expect(graph.relationships.length).toBe(1);
    expect(graph.connectedEntities.length).toBe(1);
    expect(graph.connectedEntities[0].id).toBe(projectEntityId);
  });

  it('gets the full graph', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/kg/full-graph',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const graph = res.json();
    expect(graph.entities.length).toBe(2);
    expect(graph.relationships.length).toBe(1);
  });
});
