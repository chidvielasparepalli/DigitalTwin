import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleClient } from './connection';
import * as schema from './schema';
import { PROVENANCE } from '@digital-twin/shared';
import type { AiProvider } from '@digital-twin/ai'; // LLM needed for analysis
import { applyMigrations, createClient } from './connection';

export interface CommunicationStyleCharacteristic {
  characteristic: string; // e.g., 'avg_message_length', 'formality', 'emoji_usage'
  value: unknown; // Actual value, can be scalar or distribution object
  confidence: number;
  provenance: 'explicit' | 'inferred';
  sourceId?: string; // Link to data source (e.g., chat transcript)
}

export class CommunicationStyleEngine {
  constructor(private db: DrizzleClient, private aiProvider?: AiProvider) {}

  /**
   * Analyzes conversation data to infer communication style characteristics.
   * This is a placeholder and will be enhanced in later phases with actual AI analysis.
   */
  async analyzeStyle(twinId: string): Promise<void> {
    // For now, if no style traits exist, create some dummy ones.
    const existingStyles = await this.db.select().from(schema.communicationStyle).where(eq(schema.communicationStyle.twinId, twinId)).all();

    if (existingStyles.length === 0) {
      const dummyCharacteristics: CommunicationStyleCharacteristic[] = [
        { characteristic: 'avg_message_length', value: { avg: 150, std: 50 }, confidence: 0.7, provenance: PROVENANCE.INFERRED },
        { characteristic: 'formality', value: 'semi-formal', confidence: 0.8, provenance: PROVENANCE.INFERRED },
        { characteristic: 'emoji_usage', value: { frequency: 0.1, common: ['👍', '😊'] }, confidence: 0.6, provenance: PROVENANCE.INFERRED },
        { characteristic: 'directness', value: 0.75, confidence: 0.85, provenance: PROVENANCE.INFERRED },
      ];

      for (const char of dummyCharacteristics) {
        this.db.insert(schema.communicationStyle).values({
          id: randomUUID(),
          twinId,
          characteristic: char.characteristic,
          value: char.value,
          confidence: char.confidence,
          provenance: char.provenance,
          sourceId: char.sourceId, // Can link to a specific conversation later
        }).run();
      }
    }
  }

  /**
   * Retrieves all communication style characteristics for a given twin.
   */
  async getStyleProfile(twinId: string): Promise<(typeof schema.communicationStyle.$inferSelect)[]> {
    return this.db.select().from(schema.communicationStyle).where(eq(schema.communicationStyle.twinId, twinId)).all();
  }

  /**
   * Updates a specific communication style characteristic.
   * Can be used for user corrections or refinement.
   */
  async updateStyleCharacteristic(
    twinId: string,
    characteristicId: string,
    data: { value?: unknown; confidence?: number; provenance?: typeof PROVENANCE.EXPLICIT | typeof PROVENANCE.INFERRED },
  ): Promise<(typeof schema.communicationStyle.$inferSelect) | undefined> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.value !== undefined) patch.value = data.value;
    if (data.confidence !== undefined) patch.confidence = data.confidence;
    if (data.provenance !== undefined) patch.provenance = data.provenance;

    await this.db
      .update(schema.communicationStyle)
      .set(patch)
      .where(and(eq(schema.communicationStyle.twinId, twinId), eq(schema.communicationStyle.id, characteristicId)))
      .run();

    return this.db.select().from(schema.communicationStyle).where(eq(schema.communicationStyle.id, characteristicId)).get();
  }

  /**
   * Calculates a "Style Match Score" for a given text against the twin's profile.
   * This is a placeholder and requires actual analysis logic.
   */
  async getStyleMatchScore(twinId: string, text: string): Promise<number> {
    const profile = await this.getStyleProfile(twinId);
    if (profile.length === 0) return 0.5; // Neutral score if no profile

    // Placeholder logic: simple heuristic, this would be LLM-driven in future.
    let score = 0.5;
    if (text.length > 200) {
      score += 0.1; // Longer texts might match a verbose style
    }
    if (text.includes('👍') || text.includes('😊')) {
      score += 0.1; // Emoji usage
    }
    // More sophisticated matching would occur here
    return Math.min(1, Math.max(0, score));
  }
}

/** Convenience: open engine on a file path. */
export function openCommunicationStyleEngine(path: string): CommunicationStyleEngine {
  const { client } = createClient({ path });
  applyMigrations(client);
  return new CommunicationStyleEngine(client);
}
