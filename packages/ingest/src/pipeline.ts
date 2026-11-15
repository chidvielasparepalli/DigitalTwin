import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  createClient,
  applyMigrations,
  eq,
  type DrizzleClient,
} from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import type { AiProvider } from '@digital-twin/ai';
import { PROVENANCE } from '@digital-twin/shared';
import { extractDocument, detectKind, checksum } from './extract';
import { chunkText } from './chunk';
import { storeChunkAsMemory } from './memory-extract';
import { extractKgEntitiesAndRelationships } from './kg-extract'; // Correct import

type DataSource = typeof schema.dataSources.$inferSelect;

export interface PipelineOptions {
  /** Embedding provider. If omitted, indexing is skipped (text stored only). */
  provider?: AiProvider;
  /** Where uploaded files live. */
  uploadDir?: string;
  /** Typed client (tests pass in-memory one). */
  client?: DrizzleClient;
  /** Default db path when no client is passed. */
  dbPath?: string;
}

export interface ProcessResult {
  sourceId: string;
  status: 'processed' | 'failed';
  chunks: number;
  memories: number;
  embedded: number;
  extractedKgEntities: number;
  extractedKgRelationships: number;
  error?: string;
}

/** Resolve the raw file path from a stored source. */
function resolveFilePath(source: DataSource, uploadDir: string): string {
  const rel = source.filePath ?? '';
  if (rel.startsWith('/') || /^[A-Za-z]:[\\/]/.test(rel)) return rel;
  return `${uploadDir}/${rel}`;
}

/**
 * Full ingestion pipeline for one source:
 *   read file → validate → extract → clean → chunk → metadata → store →
 *   embed → index → memory/knowledge extraction → KG entity/relationship extraction.
 * Updates the source's status along the way. Failure → status 'failed'.
 */
export async function processSource(sourceId: string, opts: PipelineOptions = {}): Promise<ProcessResult> {
  const client = opts.client ?? createClient({ path: opts.dbPath ?? './data/twin.db' }).client;
  applyMigrations(client);
  const uploadDir = opts.uploadDir ?? './data/uploads';

  const setStatus = (status: DataSource['status'], lastError?: string) => {
    client
      .update(schema.dataSources)
      .set({ status, updatedAt: new Date(), ...(lastError ? { lastError } : {}) })
      .where(eq(schema.dataSources.id, sourceId))
      .run();
  };

  try {
    const source = client.select().from(schema.dataSources).where(eq(schema.dataSources.id, sourceId)).limit(1).get();
    if (!source) throw new Error('source not found');
    if (!source.filePath) throw new Error('source has no file path');

    setStatus('processing');
    const buf = await fs.readFile(resolveFilePath(source, uploadDir));
    const kind = detectKind(source.fileName ?? '', source.mimeType ?? undefined);
    if (!kind) throw new Error('unsupported file type');

    const doc = await extractDocument(buf, source.fileName ?? 'file', kind);
    const chunks = chunkText(doc.text);

    let embedded = 0;
    let extractedKgEntities = 0;
    let extractedKgRelationships = 0;
    const provider = opts.provider;

    // --- Process chunks and extract memories/knowledge ---
    for (const chunk of chunks) {
      const kb = storeChunkAsMemory(client, source.twinId, source.id, chunk, checksum(Buffer.from(chunk.text)));
      // If embedding provider is available, embed the knowledge item
      if (provider && kb.knowledgeId) {
        try {
          const vectors = await provider.embed([chunk.text]);
          if (vectors.length > 0) {
            client
              .insert(schema.embeddingRefs)
              .values({
                id: randomUUID(),
                entityType: 'knowledge_items',
                entityId: kb.knowledgeId,
                model: provider.embeddingModel,
                dimensions: vectors[0]!.length,
                vector: vectors[0]!,
              })
              .run();
            embedded++;
          }
        } catch (err) {
          console.warn(`[ingest] embedding failed for chunk from ${source.fileName}:`, err);
        }
      }
    }

    // --- Extract Knowledge Graph entities and relationships from the whole document text ---
    if (provider) {
      try {
        const kgData = await extractKgEntitiesAndRelationships(provider, doc.text);
        if (kgData) {
          for (const entity of kgData.entities) {
            // Find or create entity
            let storedEntity = await client.select().from(schema.kgEntities)
              .where(eq(schema.kgEntities.name, entity.name))
              .limit(1)
              .get();

            if (!storedEntity) {
              storedEntity = await client.insert(schema.kgEntities).values({
                id: randomUUID(),
                twinId: source.twinId,
                name: entity.name,
                type: entity.type,
                description: entity.description,
                metadata: entity.metadata ?? {},
                confidence: entity.confidence ?? 0.7,
                provenance: PROVENANCE.INFERRED,
                sourceId: source.id,
              }).returning().get();
            }
            extractedKgEntities++;
          }

          for (const relationship of kgData.relationships) {
            const sourceEntity = await client.select().from(schema.kgEntities)
              .where(eq(schema.kgEntities.name, relationship.sourceEntityName))
              .limit(1)
              .get();
            const targetEntity = await client.select().from(schema.kgEntities)
              .where(eq(schema.kgEntities.name, relationship.targetEntityName))
              .limit(1)
              .get();

            if (sourceEntity && targetEntity) {
              await client.insert(schema.kgRelationships).values({
                id: randomUUID(),
                twinId: source.twinId,
                sourceEntityId: sourceEntity.id,
                targetEntityId: targetEntity.id,
                type: relationship.type,
                description: relationship.description,
                confidence: relationship.confidence ?? 0.7,
                provenance: PROVENANCE.INFERRED,
                sourceId: source.id,
              }).run();
              extractedKgRelationships++;
            } else {
              console.warn(`[ingest] KG relationship ignored due to missing entity: ${relationship.sourceEntityName}-${relationship.type}->${relationship.targetEntityName}`);
            }
          }
        }
      } catch (err) {
        console.warn(`[ingest] KG extraction failed for ${source.fileName}:`, err);
      }
    }

    const memoryCount = client
      .select({ n: schema.memories.id })
      .from(schema.memories)
      .where(eq(schema.memories.sourceId, sourceId))
      .all().length;

    setStatus('processed');
    return { sourceId, status: 'processed', chunks: chunks.length, memories: memoryCount, embedded, extractedKgEntities, extractedKgRelationships };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus('failed', msg);
    return { sourceId, status: 'failed', chunks: 0, memories: 0, embedded: 0, extractedKgEntities: 0, extractedKgRelationships: 0, error: msg };
  }
}
