import type { FastifyInstance } from 'fastify';
import {
  twinsRepo,
  logAudit,
  type DrizzleClient,
  CommunicationStyleEngine,
  type CommunicationStyleRow,
} from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import { authenticate } from './auth';
import { PROVENANCE } from '@digital-twin/shared';
import { createProvider, type AiProvider } from '@digital-twin/ai'; // For LLM analysis

// Helper to get AI provider, if key is available
function maybeProvider(): AiProvider | undefined {
  const key = process.env.OPENAI_API_KEY;
  return key ? createProvider({ apiKey: key }) : undefined;
}

export function registerCommunicationStyle(app: FastifyInstance, db: DrizzleClient): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/communication-style')) return;
    await authenticate(req, reply);
  });

  // Each request gets a fresh engine instance, so provider is current
  const engine = new CommunicationStyleEngine(db, maybeProvider());

  // ── Analyze style ───────────────────────────────────────────────────────────
  app.post('/api/communication-style/analyze', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    // In a real scenario, this would analyze recent conversations
    // For now, it just ensures dummy traits are created if missing
    await engine.analyzeStyle(twin.id);
    return { message: 'Communication style analysis initiated (placeholder)' };
  });

  // ── Get style profile ───────────────────────────────────────────────────────
  app.get('/api/communication-style/profile', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const profile = await engine.getStyleProfile(twin.id);
    return profile;
  });

  // ── Update a characteristic (user correction) ───────────────────────────────
  app.patch('/api/communication-style/profile/:id', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'characteristic ID required' });

    const body = req.body as { value?: unknown; confidence?: number };
    if (body.value === undefined && body.confidence === undefined) {
      return reply.code(400).send({ error: 'at least one field (value, confidence) is required' });
    }

    const updatedChar = await engine.updateStyleCharacteristic(twin.id, id, {
      ...body,
      provenance: PROVENANCE.EXPLICIT, // User correction implies explicit provenance
    });

    if (!updatedChar) return reply.code(404).send({ error: 'characteristic not found or not owned by twin' });

    logAudit(db, {
      userId: user.id,
      twinId: twin.id,
      action: 'communication_style.characteristic_updated',
      entityType: 'communication_style',
      entityId: updatedChar.id,
      details: { old: updatedChar, new: body }, // Simplified
    });

    return updatedChar;
  });

  // ── Get Style Match Score ───────────────────────────────────────────────────
  app.post('/api/communication-style/match-score', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const body = req.body as { text?: string };
    if (!body.text || !body.text.trim()) {
      return reply.code(400).send({ error: 'text is required for score calculation' });
    }

    const score = await engine.getStyleMatchScore(twin.id, body.text);
    return { score };
  });
}
