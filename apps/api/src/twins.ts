import type { FastifyInstance } from 'fastify';
import {
  twinsRepo,
  personalInfoRepo,
  upsertPreference,
  relationshipsRepo,
  logAudit,
  eq,
  and,
  type DrizzleClient,
} from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import { authenticate } from './auth';

/** Everything under /api/twins requires auth. Returns the user's own twin. */
export function registerTwins(app: FastifyInstance, db: DrizzleClient): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/twins')) return;
    await authenticate(req, reply);
  });

  // ── create twin (onboarding) ────────────────────────────────────────────────
  app.post('/api/twins', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const existing = twinsRepo.list(db, req.authUser!.id)[0];
    if (existing) return reply.code(409).send({ error: 'twin already exists' });

    const twin = await twinsRepo.create(db, req.authUser!.id, {
      name,
      preferredName: str(body.preferredName),
      description: str(body.description),
      occupation: str(body.occupation),
      preferredLanguages: Array.isArray(body.preferredLanguages) ? body.preferredLanguages.map(String) : [],
    });

    // Personal info from onboarding.
    if (typeof body.interests === 'string' && body.interests.trim()) {
      personalInfoRepo.create(db, twin.id, { field: 'interests', value: body.interests.trim(), category: 'interests' });
    }
    if (typeof body.skills === 'string' && body.skills.trim()) {
      personalInfoRepo.create(db, twin.id, { field: 'skills', value: body.skills.trim(), category: 'skills' });
    }
    if (typeof body.goals === 'string' && body.goals.trim()) {
      personalInfoRepo.create(db, twin.id, { field: 'goals', value: body.goals.trim(), category: 'goals' });
    }
    if (typeof body.boundaries === 'string' && body.boundaries.trim()) {
      personalInfoRepo.create(db, twin.id, { field: 'boundaries', value: body.boundaries.trim(), category: 'boundaries' });
    }

    // Preferences.
    if (Array.isArray(body.likes)) for (const l of body.likes.map(String).filter(Boolean)) await upsertPreference(db, twin.id, { category: 'general', item: l, preference: 'like', strength: 0.7 });
    if (Array.isArray(body.dislikes)) for (const d of body.dislikes.map(String).filter(Boolean)) await upsertPreference(db, twin.id, { category: 'general', item: d, preference: 'dislike', strength: 0.7 });

    // Communication style basics → personal info fields (full style engine is Phase 6).
    for (const [field, value] of [['communication_style', body.communicationStyle], ['values', body.values]] as const) {
      if (typeof value === 'string' && value.trim()) personalInfoRepo.create(db, twin.id, { field, value: value.trim(), category: 'profile' });
    }

    // Relationships.
    if (Array.isArray(body.relationships)) {
      for (const r of body.relationships) {
        if (typeof r !== 'object' || r === null) continue;
        const { name, relationType } = r as { name?: unknown; relationType?: unknown };
        if (typeof name === 'string' && name.trim()) {
          relationshipsRepo.create(db, twin.id, {
            personName: name.trim(),
            relationType: typeof relationType === 'string' ? relationType : undefined,
          });
        }
      }
    }

    // Default permissions (Phase 15 expands).
    db.insert(schema.permissions)
      .values({
        id: crypto.randomUUID(),
        twinId: twin.id,
        action: 'calendar.read',
        level: 'read',
        scope: 'personal',
      })
      .run();

    logAudit(db, { userId: req.authUser!.id, twinId: twin.id, action: 'twin.created', entityType: 'twins', entityId: twin.id });
    return reply.code(201).send(twin);
  });

  // ── get own twin ────────────────────────────────────────────────────────────
  app.get('/api/twins/me', async (req) => {
    return twinsRepo.list(db, req.authUser!.id)[0] ?? null;
  });

  // ── list permissions for own twin ───────────────────────────────────────────
  app.get('/api/twins/permissions', async (req) => {
    const twin = twinsRepo.list(db, req.authUser!.id)[0];
    if (!twin) return [];
    return db.select().from(schema.permissions).where(eq(schema.permissions.twinId, twin.id)).all();
  });

  // ── update a permission level ───────────────────────────────────────────────
  app.patch('/api/twins/permissions/:id', async (req, reply) => {
    const twin = twinsRepo.list(db, req.authUser!.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });
    const { id } = req.params as { id?: string };
    const { level } = (req.body ?? {}) as { level?: string };
    const allowed = ['read', 'suggest', 'ask_confirmation', 'execute', 'blocked'];
    if (!id) return reply.code(400).send({ error: 'permission id is required' });
    if (!level || !allowed.includes(level)) return reply.code(400).send({ error: 'invalid level' });

    db.update(schema.permissions)
      .set({ level: level as typeof schema.permissions.$inferSelect['level'], updatedAt: new Date() })
      .where(and(eq(schema.permissions.id, id), eq(schema.permissions.twinId, twin.id)))
      .run();
    logAudit(db, { userId: req.authUser!.id, twinId: twin.id, action: 'permission.updated', entityType: 'permissions', entityId: id });
    return { ok: true };
  });
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
