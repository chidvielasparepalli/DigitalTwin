import { createClient, type DrizzleClient } from '@digital-twin/db';
import { randomUUID } from 'node:crypto';
import * as schema from '@digital-twin/db';

/**
 * Memory/knowledge extraction from approved chunks.
 * Phase 5+ adds LLM-driven inference; this base layer records the raw
 * material as explicit memories so the twin has something to retrieve.
 */

export type MemoryType = 'episodic' | 'semantic' | 'preference' | 'relationship' | 'decision' | 'temporal';

/** Pick a memory type by content heuristics (cheap, deterministic). */
export function guessMemoryType(text: string): MemoryType {
  const t = text.toLowerCase();
  if (/(prefer|like|dislike|love|hate|enjoy|avoid|favorite|preference)/.test(t)) return 'preference';
  if (/(i decided|i chose|i chose|i picked|decision|offer|accepted|rejected)/.test(t)) return 'decision';
  if (/(my (sister|brother|mom|dad|mother|father|friend|wife|husband|partner))/i.test(t)) return 'relationship';
  if (/(in \d{4}|last (year|month|week)|went to|visited|moved to|joined|started)/.test(t)) return 'episodic';
  return 'semantic';
}

export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: number;
}

/** Heuristic extraction of candidate memories from a chunk (statistical, not LLM). */
export function extractMemoryCandidates(text: string): ExtractedMemory[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 500);
  if (sentences.length === 0) return [];

  // Keep at most a few candidates per chunk to avoid memory flooding.
  const interesting = sentences
    .filter((s) => /(i|me|my|mine|we|us)\b/i.test(s))
    .sort((a, b) => b.length - a.length);

  return interesting.slice(0, 3).map((s) => ({
    type: guessMemoryType(s),
    content: s,
    importance: s.length > 200 ? 0.7 : 0.5,
  }));
}

/** Insert a chunk's memory candidates + knowledge item. All explicit provenance. */
export function storeChunkAsMemory(
  db: DrizzleClient,
  twinId: string,
  sourceId: string,
  chunk: { index: number; text: string },
  chunkHash: string,
): { memories: ExtractedMemory[]; knowledgeId?: string } {
  const candidates = extractMemoryCandidates(chunk.text);
  for (const m of candidates) {
    db.insert(schema.memories)
      .values({
        id: randomUUID(),
        twinId,
        type: m.type,
        content: m.content,
        importance: m.importance,
        sourceId,
        provenance: 'explicit',
        confidence: 0.9, // directly quoted from user data
      })
      .run();
  }

  // Always record the full chunk as a knowledge item (retrievable in Phase 4+).
  const knowledgeId = randomUUID();
  db.insert(schema.knowledgeItems)
    .values({
      id: knowledgeId,
      twinId,
      topic: `source:${sourceId}:chunk:${chunk.index}`,
      content: chunk.text,
      category: 'ingested',
      sourceId,
      provenance: 'explicit',
      confidence: 1,
    })
    .run();

  void chunkHash; // retained for future dedup / embedding references
  return { memories: candidates, knowledgeId };
}

/** Convenience: open client on a path (used by CLI/jobs). */
export function openClient(path: string) {
  return createClient({ path });
}
