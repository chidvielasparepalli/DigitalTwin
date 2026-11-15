import type { FastifyInstance } from 'fastify';
import {
  twinsRepo,
  logAudit,
  type DrizzleClient,
  PersonalityEngine,
  type PersonalityTrait, // Re-export for easier use in API responses/types
} from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import { authenticate } from './auth';
import { PROVENANCE } from '@digital-twin/shared';

export function registerPersonality(app: FastifyInstance, db: DrizzleClient): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/personality')) return;
    await authenticate(req, reply);
  });

  const engine = new PersonalityEngine(db);

  // ── Infer traits ────────────────────────────────────────────────────────────
  app.post('/api/personality/infer', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    // In a real scenario, this would trigger a more complex, potentially async, inference process
    // For now, it just ensures dummy traits are created if missing
    await engine.inferTraits(twin.id);
    return { message: 'Inference process initiated (placeholder)' };
  });

  // ── Get all traits ──────────────────────────────────────────────────────────
  app.get('/api/personality/traits', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const traits = await engine.getTraits(twin.id);
    return traits;
  });

  // ── Update a trait (user correction) ────────────────────────────────────────
  app.patch('/api/personality/traits/:id', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'trait ID required' });

    const body = req.body as { value?: number; confidence?: number; evidence?: { text: string; sourceId?: string }[] };
    if (body.value === undefined && body.confidence === undefined && body.evidence === undefined) {
      return reply.code(400).send({ error: 'at least one field (value, confidence, evidence) is required' });
    }

    const updatedTrait = await engine.updateTrait(twin.id, id, {
      ...body,
      // When user corrects, provenance becomes explicit
      provenance: PROVENANCE.EXPLICIT,
    });

    if (!updatedTrait) return reply.code(404).send({ error: 'trait not found or not owned by twin' });

    logAudit(db, {
      userId: user.id,
      twinId: twin.id,
      action: 'personality.trait_updated',
      entityType: 'personality_traits',
      entityId: updatedTrait.id,
      details: { old: updatedTrait, new: body }, // Simplified: full diff would be better
    });

    return updatedTrait;
  });
}
