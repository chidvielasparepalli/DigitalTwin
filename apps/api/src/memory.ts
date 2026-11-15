import type { FastifyInstance } from 'fastify';
import {
  twinsRepo,
  memoriesRepo,
  eq,
  and,
  type DrizzleClient,
  MemoryEngine,
} from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import { authenticate } from './auth';

export function registerMemory(app: FastifyInstance, db: DrizzleClient): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/memory')) return;
    await authenticate(req, reply);
  });

  const engine = new MemoryEngine(db);

  // ── query memories ──────────────────────────────────────────────────────────
  app.post('/api/memory/query', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const body = req.body as {
      query?: string;
      limit?: number;
      minConfidence?: number;
      types?: Array<'episodic' | 'semantic' | 'preference' | 'relationship' | 'decision' | 'temporal'>;
      eventFrom?: string;
      eventTo?: string;
      includeInactive?: boolean;
    };

    if (!body.query || !body.query.trim()) {
      return reply.code(400).send({ error: 'query is required' });
    }

    const results = await engine.retrieve({
      twinId: twin.id,
      queryText: body.query,
      limit: body.limit ?? 10,
      minConfidence: body.minConfidence ?? 0,
      types: body.types,
      eventFrom: body.eventFrom ? new Date(body.eventFrom) : undefined,
      eventTo: body.eventTo ? new Date(body.eventTo) : undefined,
      includeInactive: body.includeInactive ?? false,
    });

    return { query: body.query, results };
  });

  // ── get single memory ───────────────────────────────────────────────────────
  app.get('/api/memory/:id', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });
    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'id required' });
    const mem = memoriesRepo.byId(db, twin.id, id);
    if (!mem) return reply.code(404).send({ error: 'not found' });
    return mem;
  });

  // ── update memory (soft: importance, status, content) ───────────────────────
  app.patch('/api/memory/:id', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });
    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'id required' });
    const mem = memoriesRepo.byId(db, twin.id, id);
    if (!mem) return reply.code(404).send({ error: 'not found' });

    const body = req.body as {
      content?: string;
      importance?: number;
      status?: 'active' | 'invalidated' | 'archived';
    };
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.content === 'string') patch.content = body.content;
    if (typeof body.importance === 'number') patch.importance = Math.max(0, Math.min(1, body.importance));
    if (typeof body.status === 'string') patch.status = body.status;

    db.update(schema.memories).set(patch).where(and(eq(schema.memories.twinId, twin.id), eq(schema.memories.id, id))).run();
    return memoriesRepo.byId(db, twin.id, id);
  });

  // ── soft-delete / archive memory ────────────────────────────────────────────
  app.delete('/api/memory/:id', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });
    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'id required' });
    const mem = memoriesRepo.byId(db, twin.id, id);
    if (!mem) return reply.code(404).send({ error: 'not found' });

    memoriesRepo.remove(db, twin.id, id);
    return { ok: true };
  });
}