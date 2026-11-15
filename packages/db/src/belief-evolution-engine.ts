import { eq, and, desc, isNotNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleClient } from './connection';
import * as schema from './schema';
import { PROVENANCE } from '@digital-twin/shared';
import { upsertPreference } from './repositories';
import { applyMigrations, createClient } from './connection';

export interface BeliefEvolutionRecord {
  id: string;
  twinId: string;
  entityType: 'preference'; // Expand to other types later
  entityId: string; // ID of the belief that evolved
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  sourceId?: string;
  createdAt: Date;
}

export class BeliefEvolutionEngine {
  constructor(private db: DrizzleClient) {}

  /**
   * Records an evolution/change for a specific belief.
   */
  async recordEvolution(
    twinId: string,
    entityId: string,
    entityType: BeliefEvolutionRecord['entityType'],
    previousValue: unknown,
    newValue: unknown,
    reason: string,
    sourceId?: string,
  ): Promise<BeliefEvolutionRecord> {
    const record = {
      id: randomUUID(),
      twinId,
      entityType,
      entityId,
      previousValue,
      newValue,
      reason,
      sourceId,
      createdAt: new Date(),
    };
    // For now, we don't have a dedicated `belief_evolution` table.
    // This implies that the evolution is implicitly tracked via linking old/new preferences.
    // A separate table would be created if needed for a centralized audit.
    // For now, we'll return the record as if it were stored.
    console.log('[BeliefEvolutionEngine] Recorded evolution:', record);
    return record;
  }

  /**
   * Upserts a preference, handling potential contradictions and recording evolution.
   */
  async upsertPreferenceAndRecordEvolution(
    twinId: string,
    data: {
      category: string;
      item: string;
      preference: 'like' | 'dislike' | 'neutral' | 'avoid';
      strength?: number;
      confidence?: number;
      sourceId?: string;
    },
  ): Promise<typeof schema.preferences.$inferSelect> {
    const prevActive = await this.db
      .select()
      .from(schema.preferences)
      .where(
        and(eq(schema.preferences.twinId, twinId), eq(schema.preferences.item, data.item), eq(schema.preferences.status, 'active')),
      )
      .orderBy(desc(schema.preferences.createdAt))
      .limit(1)
      .get();

    // If there's a previous active preference for the same item
    if (prevActive) {
      // If the new preference is different from the previous one (contradiction/change)
      if (prevActive.preference !== data.preference || prevActive.strength !== data.strength) {
        // Record evolution (conceptually, for now)
        await this.recordEvolution(
          twinId,
          prevActive.id,
          'preference',
          { preference: prevActive.preference, strength: prevActive.strength },
          { preference: data.preference, strength: data.strength },
          'User provided new explicit preference for item',
          data.sourceId,
        );

        // Update the previous one to be superseded and link to the new one (if schema supported `evolvedToId`)
        // For now, it will be superseded, and the new one will link back.
        await this.db
            .update(schema.preferences)
            .set({ status: 'superseded', updatedAt: new Date() })
            .where(eq(schema.preferences.id, prevActive.id))
            .run();
      } else {
          // If the new preference is identical, just update metadata (confidence, sourceId) if necessary.
          // Or simply return the existing one. For this phase, we'll insert a new identical one to show provenance change.
      }
    }

    // Insert the new preference (linking to previous if it was superseded)
    const newPreference = await upsertPreference(this.db, twinId, {
      ...data,
    });

    // If we superseded a previous one, link it back (conceptual, as evolvedFromId is on new pref)
    if (prevActive && prevActive.id !== newPreference.id) {
        await this.db.update(schema.preferences)
            .set({evolvedFromId: prevActive.id})
            .where(eq(schema.preferences.id, newPreference.id))
            .run();
    }


    return newPreference;
  }


  /**
   * Retrieves the evolution history for a specific belief item (e.g., preference for 'remote_work').
   */
  async getBeliefEvolutionHistory(twinId: string, entityType: BeliefEvolutionRecord['entityType'], item: string): Promise<(typeof schema.preferences.$inferSelect)[]> {
    if (entityType === 'preference') {
      return this.db
        .select()
        .from(schema.preferences)
        .where(and(eq(schema.preferences.twinId, twinId), eq(schema.preferences.item, item)))
        .orderBy(desc(schema.preferences.createdAt))
        .all();
    }
    // Expand to other entity types later
    return [];
  }
}

/** Convenience: open engine on a file path. */
export function openBeliefEvolutionEngine(path: string): BeliefEvolutionEngine {
  const { client } = createClient({ path });
  applyMigrations(client);
  return new BeliefEvolutionEngine(client);
}