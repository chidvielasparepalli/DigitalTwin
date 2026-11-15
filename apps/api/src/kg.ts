import type { FastifyInstance } from 'fastify';
import {
  twinsRepo,
  logAudit,
  type DrizzleClient,
  KnowledgeGraphEngine,
  type KgEntityType,
  type KgRelationshipType,
  type KgEntity,
  type KgRelationship,
} from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import { authenticate } from './auth';
import { PROVENANCE } from '@digital-twin/shared';

export function registerKnowledgeGraph(app: FastifyInstance, db: DrizzleClient): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/kg')) return;
    await authenticate(req, reply);
  });

  const engine = new KnowledgeGraphEngine(db);

  // ── Create/Upsert Entity ───────────────────────────────────────────────────
  app.post('/api/kg/entity', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const body = req.body as {
      name?: string;
      type?: KgEntityType;
      description?: string;
      metadata?: Record<string, unknown>;
      confidence?: number;
    };

    if (!body.name || !body.type) {
      return reply.code(400).send({ error: 'name and type are required' });
    }

    const entity = await engine.upsertEntity(twin.id, {
      name: body.name,
      type: body.type,
      description: body.description,
      metadata: body.metadata,
      confidence: body.confidence,
      provenance: PROVENANCE.EXPLICIT, // User-added entities are explicit
      sourceId: twin.id, // Linked to twin itself as manual input
    });

    logAudit(db, {
      userId: user.id,
      twinId: twin.id,
      action: 'kg.entity_created',
      entityType: 'kg_entities',
      entityId: entity.id,
      details: { name: entity.name, type: entity.type },
    });

    return reply.code(201).send(entity);
  });

  // ── Create Relationship ────────────────────────────────────────────────────
  app.post('/api/kg/relationship', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const body = req.body as {
      sourceEntityId?: string;
      targetEntityId?: string;
      type?: KgRelationshipType;
      description?: string;
      confidence?: number;
    };

    if (!body.sourceEntityId || !body.targetEntityId || !body.type) {
      return reply.code(400).send({ error: 'sourceEntityId, targetEntityId, and type are required' });
    }

    // Verify entities exist and belong to the twin
    const sourceExists = await engine.getEntities(twin.id).then(e => e.some(x => x.id === body.sourceEntityId));
    const targetExists = await engine.getEntities(twin.id).then(e => e.some(x => x.id === body.targetEntityId));
    if (!sourceExists || !targetExists) {
      return reply.code(404).send({ error: 'source or target entity not found or not owned by twin' });
    }

    const relationship = await engine.createRelationship(twin.id, {
      sourceEntityId: body.sourceEntityId,
      targetEntityId: body.targetEntityId,
      type: body.type,
      description: body.description,
      confidence: body.confidence,
      provenance: PROVENANCE.EXPLICIT,
      sourceId: twin.id,
    });

    logAudit(db, {
      userId: user.id,
      twinId: twin.id,
      action: 'kg.relationship_created',
      entityType: 'kg_relationships',
      entityId: relationship.id,
      details: { type: relationship.type, source: relationship.sourceEntityId, target: relationship.targetEntityId },
    });

    return reply.code(201).send(relationship);
  });

  // ── Get All Entities ───────────────────────────────────────────────────────
  app.get('/api/kg/entities', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const { type } = req.query as { type?: KgEntityType };
    const entities = await engine.getEntities(twin.id, type);
    return entities;
  });

  // ── Get All Relationships ──────────────────────────────────────────────────
  app.get('/api/kg/relationships', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const { type } = req.query as { type?: KgRelationshipType };
    const relationships = await engine.getRelationships(twin.id, type);
    return relationships;
  });

  // ── Get Full Graph ─────────────────────────────────────────────────────────
  app.get('/api/kg/full-graph', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const fullGraph = await engine.getFullGraph(twin.id);
    return fullGraph;
  });

  // ── Get Connected Graph for Entity ─────────────────────────────────────────
  app.get('/api/kg/entity/:id/connected', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'entity ID required' });

    const connectedGraph = await engine.getConnectedGraph(twin.id, id);
    if (!connectedGraph.entity) {
      return reply.code(404).send({ error: 'entity not found or not owned by twin' });
    }
    return connectedGraph;
  });
}
