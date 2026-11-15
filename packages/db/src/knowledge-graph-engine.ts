import { eq, and, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleClient } from './connection';
import * as schema from './schema';
import { PROVENANCE } from '@digital-twin/shared';
import { kgEntitiesRepo, kgRelationshipsRepo } from './repositories';
import { applyMigrations, createClient } from './connection';

export type KgEntityType = typeof schema.kgEntities.$inferSelect['type'];
export type KgRelationshipType = typeof schema.kgRelationships.$inferSelect['type'];

export type KgEntity = typeof schema.kgEntities.$inferSelect;
export type KgRelationship = typeof schema.kgRelationships.$inferSelect;

export class KnowledgeGraphEngine {
  constructor(private db: DrizzleClient) {}

  /**
   * Creates or updates a knowledge graph entity.
   */
  async upsertEntity(
    twinId: string,
    data: {
      name: string;
      type: KgEntityType;
      description?: string;
      metadata?: Record<string, unknown>;
      confidence?: number;
      provenance?: 'explicit' | 'inferred';
      sourceId?: string;
    },
  ): Promise<KgEntity> {
    // Check if entity with same name and type already exists for this twin
    const existing = await this.db
      .select()
      .from(schema.kgEntities)
      .where(and(eq(schema.kgEntities.twinId, twinId), eq(schema.kgEntities.name, data.name), eq(schema.kgEntities.type, data.type)))
      .limit(1)
      .get();

    if (existing) {
      await kgEntitiesRepo.update(this.db, twinId, existing.id, {
        description: data.description,
        metadata: data.metadata,
        confidence: data.confidence,
        provenance: data.provenance,
        sourceId: data.sourceId,
      });
      return { ...existing, ...data } as KgEntity; // Return merged data
    } else {
      const newEntity = await kgEntitiesRepo.create(this.db, twinId, {
        name: data.name,
        type: data.type,
        description: data.description,
        metadata: data.metadata ?? {},
        confidence: data.confidence ?? 0.5,
        provenance: data.provenance ?? PROVENANCE.INFERRED, // Default to inferred if not specified
        sourceId: data.sourceId,
      });
      return newEntity;
    }
  }

  /**
   * Creates a knowledge graph relationship between two entities.
   */
  async createRelationship(
    twinId: string,
    data: {
      sourceEntityId: string;
      targetEntityId: string;
      type: KgRelationshipType;
      description?: string;
      confidence?: number;
      provenance?: 'explicit' | 'inferred';
      sourceId?: string;
    },
  ): Promise<KgRelationship> {
    const newRelationship = await kgRelationshipsRepo.create(this.db, twinId, {
      sourceEntityId: data.sourceEntityId,
      targetEntityId: data.targetEntityId,
      type: data.type,
      description: data.description,
      confidence: data.confidence ?? 0.5,
      provenance: data.provenance ?? PROVENANCE.INFERRED,
      sourceId: data.sourceId,
    });
    return newRelationship;
  }

  /**
   * Retrieves all entities for a twin, optionally filtered by type.
   */
  async getEntities(twinId: string, type?: KgEntityType): Promise<KgEntity[]> {
    if (type) {
      return this.db.select().from(schema.kgEntities).where(and(eq(schema.kgEntities.twinId, twinId), eq(schema.kgEntities.type, type))).all();
    }
    return kgEntitiesRepo.list(this.db, twinId);
  }

  /**
   * Retrieves all relationships for a twin, optionally filtered by type.
   */
  async getRelationships(twinId: string, type?: KgRelationshipType): Promise<KgRelationship[]> {
    if (type) {
      return this.db.select().from(schema.kgRelationships).where(and(eq(schema.kgRelationships.twinId, twinId), eq(schema.kgRelationships.type, type))).all();
    }
    return kgRelationshipsRepo.list(this.db, twinId);
  }

  /**
   * Retrieves entities and relationships directly connected to a given entity.
   */
  async getConnectedGraph(twinId: string, entityId: string): Promise<{ entity: KgEntity | undefined; relationships: KgRelationship[]; connectedEntities: KgEntity[] }> {
    const entity = await kgEntitiesRepo.byId(this.db, twinId, entityId);
    if (!entity) return { entity: undefined, relationships: [], connectedEntities: [] };

    const relationships = await this.db
      .select()
      .from(schema.kgRelationships)
      .where(
        and(
          eq(schema.kgRelationships.twinId, twinId),
          or(eq(schema.kgRelationships.sourceEntityId, entityId), eq(schema.kgRelationships.targetEntityId, entityId)),
        ),
      )
      .all();

    const connectedEntityIds = new Set<string>();
    for (const rel of relationships) {
      connectedEntityIds.add(rel.sourceEntityId);
      connectedEntityIds.add(rel.targetEntityId);
    }
    connectedEntityIds.delete(entityId); // Remove the central entity itself

    const connectedEntities: KgEntity[] = [];
    if (connectedEntityIds.size > 0) {
      const ids = Array.from(connectedEntityIds);
      const fetchedEntities = await this.db.select().from(schema.kgEntities).where(
        and(eq(schema.kgEntities.twinId, twinId), sql`${schema.kgEntities.id} IN (${sql.join(ids)})`)
      ).all();
      connectedEntities.push(...fetchedEntities);
    }

    return { entity, relationships, connectedEntities };
  }

  /**
   * Retrieves all entities and relationships for a twin (entire graph).
   */
  async getFullGraph(twinId: string): Promise<{ entities: KgEntity[]; relationships: KgRelationship[] }> {
    const entities = await kgEntitiesRepo.list(this.db, twinId);
    const relationships = await kgRelationshipsRepo.list(this.db, twinId);
    return { entities, relationships };
  }
}

/** Convenience: open graph engine on a file path. */
export function openKnowledgeGraphEngine(path: string): KnowledgeGraphEngine {
  const { client } = createClient({ path });
  applyMigrations(client);
  return new KnowledgeGraphEngine(client);
}
