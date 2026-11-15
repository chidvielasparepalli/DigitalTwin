import type { AiProvider } from './index';
import {
  MemoryEngine,
  PersonalityEngine,
  CommunicationStyleEngine,
  KnowledgeGraphEngine,
  type DrizzleClient,
  type ScoredMemory,
  type PersonalityTrait,
  type CommunicationStyleRow,
  type KgEntity,
  type KgRelationship,
  type UserRow,
  type TwinRow,
  type Decision,
  DecisionEngine,
  type DecisionPrediction,
} from '@digital-twin/db';

export interface TwinBrainInput {
  userId: string;
  twinId: string;
  query: string; // User's natural language input
}

export interface TwinBrainOutput {
  response: string;
  explanation: string; // Safe explanation of reasoning
  confidence: number;
  relevantMemories: ScoredMemory[];
  relevantPersonalityTraits: PersonalityTrait[];
  relevantCommunicationStyle: CommunicationStyleRow[];
  relevantKgEntities: KgEntity[];
  relevantKgRelationships: KgRelationship[];
  relevantDecisions: Decision[];
  knownFacts: string[];
  inferences: string[];
  unknownInformation: string[];
  decisionPrediction?: DecisionPrediction; // Optional decision prediction output
}

/**
 * The central orchestration engine for the Digital Twin.
 * It integrates various specialized engines to generate context-aware responses and predictions.
 */
export class TwinBrain {
  private memoryEngine: MemoryEngine;
  private personalityEngine: PersonalityEngine;
  private communicationStyleEngine: CommunicationStyleEngine;
  private kgEngine: KnowledgeGraphEngine;
  private decisionEngine: DecisionEngine;

  constructor(
    private db: DrizzleClient,
    private aiProvider: AiProvider,
  ) {
    this.memoryEngine = new MemoryEngine(db);
    this.personalityEngine = new PersonalityEngine(db);
    this.communicationStyleEngine = new CommunicationStyleEngine(db);
    this.kgEngine = new KnowledgeGraphEngine(db);
    this.decisionEngine = new DecisionEngine(db);
  }

  /**
   * Processes a user's input through the entire reasoning pipeline.
   *
   * Reasoning Pipeline:
   * USER INPUT
   * ↓
   * INTENT DETECTION (LLM)
   * ↓
   * CONTEXT ANALYSIS (LLM, Memory, KG)
   * ↓
   * MEMORY RETRIEVAL (MemoryEngine)
   * ↓
   * KNOWLEDGE GRAPH RETRIEVAL (KgEngine)
   * ↓
   * PERSONALITY RETRIEVAL (PersonalityEngine)
   * ↓
   * COMMUNICATION STYLE RETRIEVAL (CommStyleEngine)
   * ↓
   * RELEVANT PAST DECISIONS (DB Query)
   * ↓
   * REASONING (LLM)
   * ↓
   * RESPONSE GENERATION (LLM)
   * ↓
   * CONFIDENCE EVALUATION (LLM)
   * ↓
   * FINAL RESPONSE
   */
  async processInput(input: TwinBrainInput): Promise<TwinBrainOutput> {
    const { userId, twinId, query } = input;

    // --- 1. Intent Detection ---
    let intent: 'chat' | 'decision_prediction' = 'chat'; // Default to chat
    if (query.toLowerCase().includes('what would i do') || query.toLowerCase().includes('what would i choose') || query.toLowerCase().includes('would i accept')) {
      intent = 'decision_prediction';
    }

    console.log(`[TwinBrain] Processing input for twin ${twinId}, query: "${query}", intent: ${intent}`);

    // --- 2. Context Analysis (Placeholder) ---
    // Extract key entities, topics from query
    const queryKeywords = this.memoryEngine.extractKeywords(query.toLowerCase());

    // --- 3. Memory Retrieval ---
    const relevantMemories = await this.memoryEngine.retrieve({ twinId, queryText: query, limit: 5 });

    // --- 4. Knowledge Graph Retrieval ---
    const relevantKgEntities: KgEntity[] = [];
    const relevantKgRelationships: KgRelationship[] = [];
    // For now, retrieve all entities/relationships and filter by keyword later.
    const fullGraph = await this.kgEngine.getFullGraph(twinId);
    relevantKgEntities.push(...fullGraph.entities.filter((e: KgEntity) => queryKeywords.has(e.name.toLowerCase())));
    for (const entity of relevantKgEntities) {
      const connected = await this.kgEngine.getConnectedGraph(twinId, entity.id);
      relevantKgRelationships.push(...connected.relationships);
      relevantKgEntities.push(...connected.connectedEntities);
    }
    // Dedup entities
    const seenEntityIds = new Set<string>();
    const dedupedKgEntities: KgEntity[] = [];
    for (const e of relevantKgEntities) {
        if (!seenEntityIds.has(e.id)) {
            dedupedKgEntities.push(e);
            seenEntityIds.add(e.id);
        }
    }


    // --- 5. Personality Retrieval ---
    const relevantPersonalityTraits = await this.personalityEngine.getTraits(twinId);

    // --- 6. Communication Style Retrieval ---
    const relevantCommunicationStyle = await this.communicationStyleEngine.getStyleProfile(twinId);

    // --- 7. Relevant Past Decisions ---
    // This is now handled by the DecisionEngine for decision prediction intent
    let relevantDecisions: Decision[] = []; // Placeholder, if not decision intent
    let decisionPrediction: DecisionPrediction | undefined;

    if (intent === 'decision_prediction') {
      decisionPrediction = await this.decisionEngine.predictDecision({
        twinId,
        scenario: query, // User query is the scenario for prediction
        currentContext: '', // Placeholder for more detailed context
      });
      relevantDecisions = decisionPrediction.relevantDecisions; // Include relevant decisions from prediction
    }


    // --- 8. Reasoning (LLM) ---
    // If it's a decision prediction, prompt the LLM differently
    const systemPrompt = intent === 'decision_prediction'
      ? this.constructDecisionPredictionSystemPrompt(
          query,
          decisionPrediction!, // Asserting non-null because of the if-block
          relevantMemories,
          relevantPersonalityTraits,
          relevantCommunicationStyle,
          dedupedKgEntities,
          relevantKgRelationships,
        )
      : this.constructReasoningSystemPrompt(
          relevantMemories,
          relevantPersonalityTraits,
          relevantCommunicationStyle,
          dedupedKgEntities,
          relevantKgRelationships,
          relevantDecisions,
        );

    const llmResponse = await this.aiProvider.complete(systemPrompt, query);

    // --- 9. Confidence Evaluation (Placeholder) ---
    // An LLM call or heuristic to assess confidence based on evidence
    const confidence = 0.75; // Placeholder

    // --- 10. Distinguish Knowledge Types (Placeholder) ---
    // LLM would classify response parts into known/inferred/unknown
    const knownFacts: string[] = []; // Placeholder
    const inferences: string[] = []; // Placeholder
    const unknownInformation: string[] = []; // Placeholder

    // --- 11. Explanation (Placeholder) ---
    const explanation = 'Based on internal reasoning and retrieved data.';

    return {
      response: llmResponse,
      explanation,
      confidence,
      relevantMemories,
      relevantPersonalityTraits,
            relevantCommunicationStyle,
      relevantKgEntities: dedupedKgEntities,
      relevantKgRelationships,
      relevantDecisions,
      knownFacts,
      inferences,
      unknownInformation,
      decisionPrediction,
    };
  }

  private constructReasoningSystemPrompt(
    memories: ScoredMemory[],
    personality: PersonalityTrait[],
    commStyle: CommunicationStyleRow[],
    kgEntities: KgEntity[],
    kgRelationships: KgRelationship[],
    decisions: Decision[],
  ): string {
    let prompt = `You are the Digital Twin of a person. Your goal is to respond as this person would, based on their memories, personality, communication style, knowledge, and past decisions.`;

    if (memories.length > 0) {
      prompt += `\n\nMemories (ranked by relevance):\n`;
      for (const mem of memories) {
        prompt += `- [${mem.type}]: ${mem.content} (Confidence: ${mem.confidence.toFixed(2)}, Score: ${mem.score.toFixed(2)})\n`;
      }
    }

    if (personality.length > 0) {
      prompt += `\n\nPersonality Traits:\n`;
      for (const trait of personality) {
        prompt += `- ${trait.trait.replace(/_/g, ' ')}: ${(trait.value * 100).toFixed(0)}% (Confidence: ${trait.confidence.toFixed(2)}, Provenance: ${trait.provenance})\n`;
      }
    }

    if (commStyle.length > 0) {
      prompt += `\n\nCommunication Style Characteristics:\n`;
      for (const char of commStyle) {
        prompt += `- ${char.characteristic.replace(/_/g, ' ')}: ${JSON.stringify(char.value)} (Confidence: ${char.confidence.toFixed(2)}, Provenance: ${char.provenance})\n`;
      }
    }

    if (kgEntities.length > 0 || kgRelationships.length > 0) {
      prompt += `\n\nKnowledge Graph:\n`;
      if (kgEntities.length > 0) {
        prompt += `Entities:\n`;
        for (const entity of kgEntities) {
          prompt += `- ${entity.name} (${entity.type}): ${entity.description ?? 'No description'} (Confidence: ${entity.confidence.toFixed(2)})\n`;
        }
      }
      if (kgRelationships.length > 0) {
        prompt += `Relationships:\n`;
        for (const rel of kgRelationships) {
          const sourceName = kgEntities.find(e => e.id === rel.sourceEntityId)?.name || 'Unknown';
          const targetName = kgEntities.find(e => e.id === rel.targetEntityId)?.name || 'Unknown';
          prompt += `- ${sourceName} --(${rel.type})--> ${targetName} (Confidence: ${rel.confidence.toFixed(2)})\n`;
        }
      }
    }

    if (decisions.length > 0) {
      prompt += `\n\nPast Decisions:\n`;
      for (const dec of decisions) {
        prompt += `- ${dec.description} (Chosen: ${dec.chosen ?? 'N/A'}, Rationale: ${dec.rationale ?? 'N/A'})\n`;
      }
    }

    prompt += `\n\nBased on this information, generate a response that is consistent with the person's profile.`;
    prompt += `\nIf you lack sufficient information, state that you don't know rather than inventing facts or memories.`;
    prompt += `\nNever expose your internal chain of thought or raw data. Only provide the final response and a high-level explanation if requested.`;

    return prompt;
  }

  private constructDecisionPredictionSystemPrompt(
    query: string,
    prediction: DecisionPrediction,
    memories: ScoredMemory[],
    personality: PersonalityTrait[],
    commStyle: CommunicationStyleRow[],
    kgEntities: KgEntity[],
    kgRelationships: KgRelationship[],
  ): string {
    let prompt = `You are the Digital Twin of a person. Your goal is to predict how this person would respond to a scenario, based on their memories, personality, communication style, knowledge, and past decisions.`;
    prompt += `\n\nScenario: ${query}`;
    prompt += `\n\nDecision Prediction Analysis:\n`;
    prompt += `- Predicted Outcome: ${prediction.prediction}\n`;
    prompt += `- Confidence: ${(prediction.confidence * 100).toFixed(0)}%\n`;
    if (prediction.mainFactors.length > 0) {
      prompt += `- Main Factors: ${prediction.mainFactors.join(', ')}\n`;
    }
    if (prediction.alternativePossibilities.length > 0) {
      prompt += `- Alternative Possibilities: ${prediction.alternativePossibilities.join('; ')}\n`;
    }

    if (prediction.relevantDecisions.length > 0) {
      prompt += `\nRelevant Past Decisions:\n`;
      for (const dec of prediction.relevantDecisions) {
        prompt += `- ${dec.description} (Chosen: ${dec.chosen ?? 'N/A'}, Rationale: ${dec.rationale ?? 'N/A'})\n`;
      }
    }
    if (prediction.relevantPreferences.length > 0) {
        prompt += `\nRelevant Preferences:\n`;
        for (const pref of prediction.relevantPreferences) {
            prompt += `- ${pref.item}: ${pref.preference} (Confidence: ${pref.confidence.toFixed(2)})\n`;
        }
    }

    if (memories.length > 0) {
      prompt += `\nRelevant Memories:\n`;
      for (const mem of memories) {
        prompt += `- [${mem.type}]: ${mem.content} (Score: ${mem.score.toFixed(2)})\n`;
      }
    }
    // Add other relevant context
    if (personality.length > 0) {
        prompt += `\nPersonality Traits:\n`;
        for (const trait of personality) {
          prompt += `- ${trait.trait.replace(/_/g, ' ')}: ${(trait.value * 100).toFixed(0)}% (Confidence: ${trait.confidence.toFixed(2)})\n`;
        }
    }
    if (commStyle.length > 0) {
        prompt += `\nCommunication Style Characteristics:\n`;
        for (const char of commStyle) {
          prompt += `- ${char.characteristic.replace(/_/g, ' ')}: ${JSON.stringify(char.value)} (Confidence: ${char.confidence.toFixed(2)})\n`;
        }
    }
    if (kgEntities.length > 0 || kgRelationships.length > 0) {
        prompt += `\nKnowledge Graph Context:\n`;
        if (kgEntities.length > 0) {
            prompt += `Entities:\n`;
            for (const entity of kgEntities) {
                prompt += `- ${entity.name} (${entity.type}): ${entity.description ?? 'No description'} (Confidence: ${entity.confidence.toFixed(2)})\n`;
            }
        }
        if (kgRelationships.length > 0) {
            prompt += `Relationships:\n`;
            for (const rel of kgRelationships) {
                const sourceName = kgEntities.find(e => e.id === rel.sourceEntityId)?.name || 'Unknown';
                const targetName = kgEntities.find(e => e.id === rel.targetEntityId)?.name || 'Unknown';
                prompt += `- ${sourceName} --(${rel.type})--> ${targetName} (Confidence: ${rel.confidence.toFixed(2)})\n`;
            }
        }
    }


    prompt += `\n\nGenerate a clear, concise prediction of the person's likely decision, along with a brief explanation.`;
    prompt += `\nEmphasize that this is a prediction, not a certainty.`;
    prompt += `\nIf insufficient evidence exists to make a confident prediction, state that.`;
    prompt += `\nNever invent facts or personal memories.`;
    prompt += `\nDo not output the raw context provided above.`;

    return prompt;
  }
}