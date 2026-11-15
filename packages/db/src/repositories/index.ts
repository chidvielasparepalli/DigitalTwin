import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleClient } from '../connection';
import * as schema from '../schema';
import { makeRepo } from './common';
import { BeliefEvolutionEngine } from '../belief-evolution-engine'; // Import the engine

type User = typeof schema.users.$inferSelect;
type Twin = typeof schema.twins.$inferSelect;
type Preference = typeof schema.preferences.$inferSelect;
type Inference = typeof schema.inferences.$inferSelect;

type PreferenceValue = 'like' | 'dislike' | 'neutral' | 'avoid';

export const usersRepo = {
  byId(tx: DrizzleClient, id: string) {
    return tx.select().from(schema.users).where(eq(schema.users.id, id)).limit(1).get();
  },
  byEmail(tx: DrizzleClient, email: string) {
    return tx.select().from(schema.users).where(eq(schema.users.email, email)).limit(1).get();
  },
  create(tx: DrizzleClient, data: { email: string; name: string; passwordHash: string }): User {
    const id = randomUUID();
    tx.insert(schema.users).values({ id, ...data }).run();
    return this.byId(tx, id) as User;
  },
};

/** Twins are scoped by userId (not twinId) and have no status column — separate impl. */
export const twinsRepo = {
  list(tx: DrizzleClient, userId: string): Twin[] {
    return tx.select().from(schema.twins).where(eq(schema.twins.userId, userId)).all() as Twin[];
  },
  create(tx: DrizzleClient, userId: string, data: { name: string; preferredName?: string; description?: string; occupation?: string; preferredLanguages?: string[] }): Twin {
    const id = randomUUID();
    tx.insert(schema.twins).values({ ...data, id, userId }).run();
    return tx.select().from(schema.twins).where(eq(schema.twins.id, id)).limit(1).get() as Twin;
  },
};

export const personalInfoRepo = makeRepo<typeof schema.personalInformation.$inferSelect>(schema.personalInformation);
export const memoriesRepo = makeRepo<typeof schema.memories.$inferSelect>(schema.memories);
export const knowledgeRepo = makeRepo<typeof schema.knowledgeItems.$inferSelect>(schema.knowledgeItems);
export const conversationsRepo = makeRepo<typeof schema.conversations.$inferSelect>(schema.conversations);
export const personalityTraitsRepo = makeRepo<typeof schema.personalityTraits.$inferSelect>(schema.personalityTraits);
export const communicationStyleRepo = makeRepo<typeof schema.communicationStyle.$inferSelect>(schema.communicationStyle);
export const relationshipsRepo = makeRepo<typeof schema.relationships.$inferSelect>(schema.relationships);
export const lifeEventsRepo = makeRepo<typeof schema.lifeEvents.$inferSelect>(schema.lifeEvents);
export const decisionsRepo = makeRepo<typeof schema.decisions.$inferSelect>(schema.decisions);
export const dataSourcesRepo = makeRepo<typeof schema.dataSources.$inferSelect>(schema.dataSources);
export const kgEntitiesRepo = makeRepo<typeof schema.kgEntities.$inferSelect>(schema.kgEntities);
export const kgRelationshipsRepo = makeRepo<typeof schema.kgRelationships.$inferSelect>(schema.kgRelationships);

/**
 * Non-destructive preference update: supersede the active row, insert a new one.
 * This now delegates to BeliefEvolutionEngine to handle the logic.
 */
export async function upsertPreference(
  tx: DrizzleClient,
  twinId: string,
  data: { category: string; item: string; preference: PreferenceValue; strength?: number; confidence?: number; sourceId?: string },
): Promise<Preference> {
  const beliefEngine = new BeliefEvolutionEngine(tx);
  return beliefEngine.upsertPreferenceAndRecordEvolution(twinId, data);
}

/** Record an AI inference. Never inserted directly into a fact table. */
export function createInference(
  tx: DrizzleClient,
  data: {
    twinId: string;
    targetType: string;
    targetId: string;
    inferenceType: string;
    value: unknown;
    confidence: number;
    evidence?: { text: string; sourceId?: string }[];
    model?: string;
    sourceId?: string;
  },
): Inference {
  const id = randomUUID();
  tx.insert(schema.inferences)
    .values({
      id,
      twinId: data.twinId,
      targetType: data.targetType,
      targetId: data.targetId,
      inferenceType: data.inferenceType,
      value: data.value,
      confidence: data.confidence,
      evidence: data.evidence ?? [],
      model: data.model,
      sourceId: data.sourceId,
    })
    .run();
  return tx.select().from(schema.inferences).where(eq(schema.inferences.id, id)).limit(1).get() as Inference;
}

/** Append an audit log row. */
export function logAudit(
  tx: DrizzleClient,
  data: {
    userId?: string;
    twinId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
    ip?: string;
  },
): void {
  tx.insert(schema.auditLogs).values({ id: randomUUID(), ...data }).run();
}
