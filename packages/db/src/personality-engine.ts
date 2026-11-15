import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleClient } from './connection';
import * as schema from './schema';
import { PERSONALITY_TRAITS, PROVENANCE, type PersonalityTrait } from '@digital-twin/shared';
import { createInference } from './repositories';
import { applyMigrations, createClient } from './connection';

export class PersonalityEngine {
  constructor(private db: DrizzleClient) {}

  /**
   * Infers and stores personality traits for a given twin based on available data.
   * This is a placeholder and will be enhanced in later phases with actual AI inference.
   */
  async inferTraits(twinId: string): Promise<void> {
    // For now, we'll just create some dummy traits if none exist
    const existingTraits = await this.db.select().from(schema.personalityTraits).where(eq(schema.personalityTraits.twinId, twinId)).all();

    if (existingTraits.length === 0) {
      for (const traitName of PERSONALITY_TRAITS) {
        // Dummy inference for now
        const traitValue = Math.random(); // Placeholder
        const confidence = 0.5; // Placeholder
        const evidence = [{ text: `Initial placeholder for ${traitName}`, sourceId: 'system-init' }];

        this.db.insert(schema.personalityTraits).values({
          id: randomUUID(),
          twinId,
          trait: traitName,
          value: traitValue,
          confidence,
          provenance: PROVENANCE.INFERRED,
          evidence: evidence,
        }).run();

        createInference(this.db, {
          twinId,
          targetType: 'personality_traits',
          targetId: twinId, // simplified for now, should be specific trait ID
          inferenceType: `initial_trait_inference_${traitName}`,
          value: { trait: traitName, value: traitValue },
          confidence,
          evidence,
          model: 'system-placeholder',
        });
      }
    }
  }

  /**
   * Retrieves all personality traits for a given twin.
   */
  async getTraits(twinId: string): Promise<(typeof schema.personalityTraits.$inferSelect)[]> {
    return this.db.select().from(schema.personalityTraits).where(eq(schema.personalityTraits.twinId, twinId)).all();
  }

  /**
   * Allows a user to correct an inferred trait or explicitly set one.
   */
  async updateTrait(
    twinId: string,
    traitId: string,
    data: { value?: number; confidence?: number; evidence?: { text: string; sourceId?: string }[]; provenance?: typeof PROVENANCE.EXPLICIT | typeof PROVENANCE.INFERRED },
  ): Promise<(typeof schema.personalityTraits.$inferSelect) | undefined> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.value !== undefined) patch.value = data.value;
    if (data.confidence !== undefined) patch.confidence = data.confidence;
    if (data.evidence !== undefined) patch.evidence = data.evidence;
    if (data.provenance !== undefined) patch.provenance = data.provenance;

    await this.db
      .update(schema.personalityTraits)
      .set(patch)
      .where(and(eq(schema.personalityTraits.twinId, twinId), eq(schema.personalityTraits.id, traitId)))
      .run();

    return this.db.select().from(schema.personalityTraits).where(eq(schema.personalityTraits.id, traitId)).get();
  }
}

/** Convenience: open engine on a file path. */
export function openPersonalityEngine(path: string): PersonalityEngine {
  const { client } = createClient({ path });
  applyMigrations(client);
  return new PersonalityEngine(client);
}
