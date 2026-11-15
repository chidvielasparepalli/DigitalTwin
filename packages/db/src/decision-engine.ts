import { eq, and, desc, isNotNull, sql } from 'drizzle-orm';
import type { DrizzleClient } from './connection';
import * as schema from './schema';
import { MemoryEngine, type ScoredMemory } from './memory-engine';
import { applyMigrations, createClient } from './connection';

export interface DecisionAnalysisInput {
  twinId: string;
  scenario: string;
  currentContext?: string;
}

export interface DecisionPrediction {
  prediction: string; // "Likely to accept", "Likely to reject", etc.
  confidence: number; // 0-1
  mainFactors: string[];
  alternativePossibilities: string[];
  relevantDecisions: (typeof schema.decisions.$inferSelect)[];
  relevantPreferences: (typeof schema.preferences.$inferSelect)[];
  relevantMemories: ScoredMemory[];
}

export class DecisionEngine {
  private memoryEngine: MemoryEngine;

  constructor(private db: DrizzleClient) {
    this.memoryEngine = new MemoryEngine(db);
  }

  /**
   * Retrieves relevant past decisions, preferences, and memories for a given scenario.
   */
  async getRelevantDecisionContext(twinId: string, scenario: string): Promise<{
    relevantDecisions: (typeof schema.decisions.$inferSelect)[];
    relevantPreferences: (typeof schema.preferences.$inferSelect)[];
    relevantMemories: ScoredMemory[];
  }> {
    // 1. Find relevant past decisions
    const relevantDecisions = await this.db
      .select()
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.twinId, twinId),
          // Simple keyword match for now, could use embeddings later
          sql`${schema.decisions.description} LIKE ${'%' + scenario + '%'} OR ${schema.decisions.context} LIKE ${'%' + scenario + '%'}`,
        ),
      )
      .orderBy(desc(schema.decisions.decisionDate))
      .limit(3)
      .all();

    // 2. Find relevant preferences
    const relevantPreferences = await this.db
      .select()
      .from(schema.preferences)
      .where(
        and(
          eq(schema.preferences.twinId, twinId),
          eq(schema.preferences.status, 'active'),
          // Simple keyword match for now
          sql`${schema.preferences.item} LIKE ${'%' + scenario + '%'} OR ${schema.preferences.category} LIKE ${'%' + scenario + '%'}`,
        ),
      )
      .limit(5)
      .all();

    // 3. Find relevant memories using the MemoryEngine
    const relevantMemories = await this.memoryEngine.retrieve({
      twinId,
      queryText: scenario,
      limit: 5,
    });

    return {
      relevantDecisions,
      relevantPreferences,
      relevantMemories,
    };
  }

  /**
   * This method would typically involve an LLM to actually "predict" the decision
   * based on the retrieved context and twin's profile.
   * For Phase 10, this will be a placeholder structured response.
   */
  async predictDecision(input: DecisionAnalysisInput): Promise<DecisionPrediction> {
    const { twinId, scenario, currentContext } = input;

    const { relevantDecisions, relevantPreferences, relevantMemories } =
      await this.getRelevantDecisionContext(twinId, scenario);

    // Placeholder LLM call to simulate prediction
    // In TwinBrain, this would use the actual AI provider
    const predictionText = `Based on your past patterns and preferences related to "${scenario}", it's highly likely you would...`;
    const confidence = 0.7; // Placeholder
    const mainFactors = ['Past decisions', 'Stated preferences'];
    const alternativePossibilities = ['If conditions change, a different outcome is possible.'];

    return {
      prediction: predictionText,
      confidence,
      mainFactors,
      alternativePossibilities,
      relevantDecisions,
      relevantPreferences,
      relevantMemories,
    };
  }
}

/** Convenience: open engine on a file path. */
export function openDecisionEngine(path: string): DecisionEngine {
  const { client } = createClient({ path });
  applyMigrations(client);
  return new DecisionEngine(client);
}
