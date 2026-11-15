import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb, createClient, applyMigrations } from '../src/index';
import { usersRepo, twinsRepo, memoriesRepo, upsertPreference, createInference, logAudit } from '../src/repositories';
import { and, eq } from 'drizzle-orm';
import * as schema from '../src/schema';

describe('repositories (CRUD on in-memory db)', () => {
  const { client } = createClient();

  beforeAll(() => {
    // In-memory db has no tables — apply the migration schema first.
    applyMigrations(client);
  });

describe('createDb', () => {
  it('opens a usable database', () => {
    const db = createDb();
    const row = db.prepare('SELECT 1 AS n').get() as { n: number };
    expect(row.n).toBe(1);
    db.close();
  });

  it('supports WAL pragma on a file-backed database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dt-'));
    const db = createDb({ path: join(dir, 't.db') });
    try {
      const journal = db.pragma('journal_mode', { simple: true }) as unknown as string;
      expect(journal).toBe('wal');
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

  it('creates a user', () => {
    const user = usersRepo.create(client, { email: 'a@b.c', name: 'Alice', passwordHash: 'x' });
    expect(user.id).toBeTruthy();
    expect(usersRepo.byEmail(client, 'a@b.c')?.name).toBe('Alice');
  });

  it('creates a twin scoped to user', async () => {
    const user = usersRepo.create(client, { email: 'u@t.com', name: 'U', passwordHash: 'x' });
    const twin = await twinsRepo.create(client, user.id, { name: 'Twin', preferredLanguages: ['en'] });
    expect(twin.userId).toBe(user.id);
    expect(twinsRepo.list(client, user.id).length).toBe(1);
  });

  it('upsertPreference supersedes old active row non-destructively', async () => {
    const user = usersRepo.create(client, { email: 'p@t.com', name: 'P', passwordHash: 'x' });
    const twin = await twinsRepo.create(client, user.id, { name: 'T' });

    const first = await upsertPreference(client, twin.id, { category: 'work', item: 'remote_work', preference: 'dislike', strength: 0.8 });
    expect(first.status).toBe('active');

    const second = await upsertPreference(client, twin.id, { category: 'work', item: 'remote_work', preference: 'like', strength: 0.9 });
    expect(second.status).toBe('active');
    expect(second.preference).toBe('like');

    const rows = client.select().from(schema.preferences).where(
      and(eq(schema.preferences.twinId, twin.id), eq(schema.preferences.item, 'remote_work')),
    ).all();
    expect(rows.length).toBe(2); // old row preserved, marked superseded
    expect(rows.map((r) => r.status).sort()).toEqual(['active', 'superseded']);
  });

  it('inference rows are separate from fact tables and retain evidence', async () => {
    const user = usersRepo.create(client, { email: 'i@t.com', name: 'I', passwordHash: 'x' });
    const twin = await twinsRepo.create(client, user.id, { name: 'T' });

    const inf = createInference(client, {
      twinId: twin.id,
      targetType: 'preferences',
      targetId: 'x',
      inferenceType: 'preference_inference',
      value: { item: 'coffee', preference: 'like' },
      confidence: 0.6,
      evidence: [{ text: 'said so' }],
      model: 'gpt-4o-mini',
    });
    expect(inf.confidence).toBe(0.6);
    expect(inf.evidence).toEqual([{ text: 'said so' }]);
    // Inferences never silently become explicit facts.
    expect(client.select().from(schema.preferences).where(eq(schema.preferences.twinId, twin.id)).all().length).toBe(0);
  });

  it('logs audit rows', async () => {
    const user = usersRepo.create(client, { email: 'l@t.com', name: 'L', passwordHash: 'x' });
    logAudit(client, { userId: user.id, action: 'twin.created' });
    const rows = client.select().from(schema.auditLogs).where(eq(schema.auditLogs.userId, user.id)).all();
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe('twin.created');
  });

  it('memory repo create/update/soft-delete', async () => {
    const user = usersRepo.create(client, { email: 'm@t.com', name: 'M', passwordHash: 'x' });
    const twin = await twinsRepo.create(client, user.id, { name: 'T' });

    const mem = memoriesRepo.create(client, twin.id, { type: 'episodic', content: 'Went to Goa', importance: 0.8 });
    expect(mem.content).toBe('Went to Goa');
    expect(mem.status).toBe('active');

    const updated = memoriesRepo.update(client, twin.id, mem.id, { content: 'Went to Goa in Dec' });
    expect(updated?.content).toBe('Went to Goa in Dec');

    memoriesRepo.remove(client, twin.id, mem.id);
    expect(memoriesRepo.byId(client, twin.id, mem.id)?.status).toBe('archived');
  });
});
