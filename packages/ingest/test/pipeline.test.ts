import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, applyMigrations, usersRepo, twinsRepo, eq } from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import { processSource } from '../src/index';

function fakeProvider() {
  return {
    chatModel: 'fake',
    embeddingModel: 'fake-embed',
    async embed(texts: string[]) {
      return texts.map((t) => Array.from({ length: 8 }, () => t.length / 100));
    },
    async complete() {
      return '';
    },
    async extractJson<T>(_system: string, _user: string, _schema: Record<string, unknown>): Promise<T | null> {
      return null;
    },
  };
}

let uploadDir: string;
const { client } = createClient();
let twinId: string;

beforeAll(async () => {
  applyMigrations(client);
  uploadDir = mkdtempSync(join(tmpdir(), 'dt-up-'));
  const user = usersRepo.create(client, { email: 'ing@t.com', name: 'I', passwordHash: 'x' });
  const twin = await twinsRepo.create(client, user.id, { name: 'T' });
  twinId = twin.id;
});

function makeSource(fileName: string, contents: string) {
  const path = join(uploadDir, fileName);
  writeFileSync(path, contents);
  const id = crypto.randomUUID();
  client
    .insert(schema.dataSources)
    .values({
      id,
      twinId,
      name: fileName,
      sourceType: 'upload',
      status: 'uploaded',
      fileName,
      mimeType: 'text/plain',
      filePath: fileName,
    })
    .run();
  return id;
}

function getSource(id: string) {
  return client.select().from(schema.dataSources).where(eq(schema.dataSources.id, id)).get();
}

describe('processSource', () => {
  it('processes a txt file into memories without a provider', async () => {
    const id = makeSource('bio.txt', 'I moved to Goa in 2024. I prefer working from home. My sister Ananya lives in Bangalore.');
    const res = await processSource(id, { client, uploadDir });
    expect(res.status).toBe('processed');
    expect(res.chunks).toBeGreaterThan(0);
    expect(res.memories).toBeGreaterThan(0);
    expect(getSource(id)?.status).toBe('processed');
  });

  it('embeds chunks when a provider is present', async () => {
    const id = makeSource('work.txt', 'I enjoy coffee and mornings. I dislike loud noises and spam calls.');
    const res = await processSource(id, { client, uploadDir, provider: fakeProvider() });
    expect(res.status).toBe('processed');
    expect(res.embedded).toBeGreaterThan(0);
    const refs = client.select().from(schema.embeddingRefs).all();
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]!.entityType).toBe('knowledge_items');
  });

  it('marks source failed on bad file', async () => {
    const id = makeSource('bad.json', '{not json');
    const res = await processSource(id, { client, uploadDir });
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/invalid JSON/);
    expect(getSource(id)?.status).toBe('failed');
  });

  it('marks source failed on missing file', async () => {
    const id = crypto.randomUUID();
    client
      .insert(schema.dataSources)
      .values({ id, twinId, name: 'ghost.txt', sourceType: 'upload', status: 'uploaded', fileName: 'ghost.txt', filePath: 'ghost.txt' })
      .run();
    const res = await processSource(id, { client, uploadDir });
    expect(res.status).toBe('failed');
  });
});

// Cleanup temp dir after all tests.
import { afterAll } from 'vitest';
afterAll(() => {
  rmSync(uploadDir, { recursive: true, force: true });
});
