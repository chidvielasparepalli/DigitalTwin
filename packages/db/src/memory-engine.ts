import { randomUUID } from 'node:crypto';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import type { DrizzleClient } from './connection';
import * as schema from './schema';
import { applyMigrations, createClient } from './connection';

export interface MemoryQueryOptions {
  twinId: string;
  queryText: string;
  /** Limit results. */
  limit?: number;
  /** Minimum confidence threshold. */
  minConfidence?: number;
  /** Filter by memory type(s). */
  types?: Array<'episodic' | 'semantic' | 'preference' | 'relationship' | 'decision' | 'temporal'>;
  /** Time window for eventAt. */
  eventFrom?: Date;
  eventTo?: Date;
  /** Include inactive/archived? */
  includeInactive?: boolean;
}

export interface ScoredMemory {
  id: string;
  type: string;
  content: string;
  importance: number;
  confidence: number;
  eventAt: Date | null;
  createdAt: Date;
  score: number;
  /** Breakdown of the hybrid score. */
  scoreBreakdown: {
    semantic: number;
    recency: number;
    importance: number;
    confidence: number;
    context: number;
  };
}

/**
 * Hybrid memory retrieval engine.
 * Combines:
 * - semantic similarity (cosine on embeddings)
 * - recency (eventAt or createdAt)
 * - importance (explicit field)
 * - confidence (provenance confidence)
 * - context relevance (keyword overlap with query)
 */
export class MemoryEngine {
  constructor(private db: DrizzleClient) {}

  /** Retrieve memories relevant to a query, ranked by hybrid score. */
  async retrieve(opts: MemoryQueryOptions): Promise<ScoredMemory[]> {
    const { twinId, queryText, limit = 10, minConfidence = 0, types, eventFrom, eventTo, includeInactive = false } = opts;

    // Build base conditions
    const conditions = [eq(schema.memories.twinId, twinId)];
    if (!includeInactive) conditions.push(eq(schema.memories.status, 'active'));
    if (types && types.length) conditions.push(sql`${schema.memories.type} IN (${sql.join(types.map(t => sql`${t}`), sql`, `)})`);
    if (minConfidence > 0) conditions.push(gte(schema.memories.confidence, minConfidence));
    if (eventFrom) conditions.push(gte(schema.memories.eventAt, eventFrom));
    if (eventTo) conditions.push(lte(schema.memories.eventAt, eventTo));

    // Fetch candidate memories with their embeddings
    const baseQuery = this.db
      .select({
        m: schema.memories,
        e: schema.embeddingRefs,
      })
      .from(schema.memories)
      .leftJoin(schema.embeddingRefs, and(
        eq(schema.embeddingRefs.entityType, 'memories'),
        eq(schema.embeddingRefs.entityId, schema.memories.id)
      ))
      .where(and(...conditions));

    const candidates = await baseQuery.all();

    if (candidates.length === 0) return [];

    // Generate query embedding if we have any vectors to compare against
    const hasVectors = candidates.some((c) => c.e?.vector);
    let queryVector: number[] | null = null;

    // We need an embedding provider - for now use a simple keyword-based context score
    // In production this would call the AI provider's embed()
    const queryWords = this.extractKeywords(queryText.toLowerCase());

    // Score each candidate
    const scored = candidates.map(({ m, e }: { m: typeof schema.memories.$inferSelect; e: typeof schema.embeddingRefs.$inferSelect | null }) => {
      // 1. Semantic similarity (0-1)
      let semantic = 0;
      if (e?.vector && queryVector) {
        semantic = this.cosineSimilarity(queryVector, e.vector as number[]);
      }

      // 2. Context relevance: keyword overlap with content (0-1)
      const contentWords = this.extractKeywords(m.content.toLowerCase());
      const overlap = Array.from(queryWords).filter((w: string) => contentWords.has(w)).length;
      const context = queryWords.size > 0 ? overlap / queryWords.size : 0;

      // 3. Recency: exponential decay from eventAt or createdAt (0-1)
      const refTime = m.eventAt ?? m.createdAt;
      const daysOld = (Date.now() - new Date(refTime).getTime()) / (1000 * 60 * 60 * 24);
      const recency = Math.exp(-daysOld / 30); // half-life ~30 days

      // 4. Importance (0-1, already normalized)
      const importance = m.importance;

      // 5. Confidence (0-1, already normalized)
      const confidence = m.confidence;

      // Weighted hybrid score
      const WEIGHTS = { semantic: 0.35, context: 0.25, recency: 0.15, importance: 0.15, confidence: 0.10 };
      const score =
        WEIGHTS.semantic * semantic +
        WEIGHTS.context * context +
        WEIGHTS.recency * recency +
        WEIGHTS.importance * importance +
        WEIGHTS.confidence * confidence;

      return {
        id: m.id,
        type: m.type,
        content: m.content,
        importance: m.importance,
        confidence: m.confidence,
        eventAt: m.eventAt ? new Date(m.eventAt) : null,
        createdAt: new Date(m.createdAt),
        score,
        scoreBreakdown: { semantic, recency, importance, confidence, context },
      };
    });

    // Sort by score descending, return top N
    return scored.sort((a: typeof scored[0], b: typeof scored[0]) => b.score - a.score).slice(0, limit);
  }

  /** Simple keyword extraction for context scoring. */
  extractKeywords(text: string): Set<string> {
    const stop = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','was','were','are','am','i','you','he','she','it','we','they','my','your','his','her','our','their','this','that','these','those','be','been','being','have','has','had','do','does','did','will','would','could','should','can','may','might','must','from','as','if','then','else','when','where','why','how','what','who','which','not','no','yes','so','than','too','very','just','more','most','some','any','all','each','every','one','two','first','last','next','new','old','good','bad','big','small']);
    return new Set(text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w))
    );
  }

  /** Cosine similarity between two vectors. */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]!;
      const bi = b[i]!;
      dot += ai * bi;
      na += ai * ai;
      nb += bi * bi;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
}

/** Convenience: open engine on a file path. */
export function openEngine(path: string): MemoryEngine {
  const { client } = createClient({ path });
  applyMigrations(client);
  return new MemoryEngine(client);
}