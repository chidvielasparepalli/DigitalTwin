import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  twinsRepo,
  logAudit,
  eq,
  type DrizzleClient,
} from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import { detectKind, validateUpload, processSource, type PipelineOptions } from '@digital-twin/ingest';
import { createProvider } from '@digital-twin/ai';
import { authenticate } from './auth';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** OpenAI provider if a key is configured; null otherwise (embedding skipped). */
function maybeProvider(): PipelineOptions['provider'] {
  const key = process.env.OPENAI_API_KEY;
  return key ? createProvider({ apiKey: key }) : undefined;
}

export function registerSources(app: FastifyInstance, db: DrizzleClient): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/sources')) return;
    await authenticate(req, reply);
  });

  const uploadDir = join(repoRoot, 'packages/db/data/uploads');
  void fs.mkdir(uploadDir, { recursive: true });

  // ── upload ──────────────────────────────────────────────────────────────────
  app.post('/api/sources/upload', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no file provided' });

    const fileName = file.filename.replace(/[\\/:*?"<>|]/g, '_');
    const kind = detectKind(fileName, file.mimetype);
    const size = file.file.bytesRead ?? 0;

    // Read the file fully for validation + storage.
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(chunk as Buffer);
    const buf = Buffer.concat(chunks);
    const realSize = buf.length;

    const err = validateUpload(fileName, realSize, kind ?? ('unknown' as never));
    if (err) return reply.code(400).send({ error: err });

    const storedName = `${randomUUID()}-${fileName}`;
    const storedPath = join(uploadDir, storedName);
    await fs.writeFile(storedPath, buf);

    const sourceId = randomUUID();
    db.insert(schema.dataSources)
      .values({
        id: sourceId,
        twinId: twin.id,
        name: fileName,
        sourceType: 'upload',
        status: 'uploaded',
        fileName,
        mimeType: file.mimetype,
        fileSize: realSize,
        filePath: storedName,
      })
      .run();

    logAudit(db, { userId: user.id, twinId: twin.id, action: 'source.uploaded', entityType: 'data_sources', entityId: sourceId, details: { fileName, bytes: realSize } });

    // Fire-and-forget background processing; client polls status.
    void processSource(sourceId, { client: db, uploadDir, provider: maybeProvider() }).catch((e) => {
      console.error('[sources] background processing crashed:', e);
    });

    return reply.code(201).send({
      id: sourceId,
      name: fileName,
      status: 'uploaded',
      message: 'upload received; processing started',
    });
  });

  // ── list sources + status ───────────────────────────────────────────────────
  app.get('/api/sources', async (req) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return [];
    return db.select().from(schema.dataSources).where(eq(schema.dataSources.twinId, twin.id)).orderBy(schema.dataSources.createdAt).all();
  });

  // ── get single source status ────────────────────────────────────────────────
  app.get('/api/sources/:id', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });
    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'id required' });
    const src = db.select().from(schema.dataSources).where(eq(schema.dataSources.id, id)).limit(1).get();
    if (!src || src.twinId !== twin.id) return reply.code(404).send({ error: 'not found' });
    return src;
  });

  // ── delete source + file ────────────────────────────────────────────────────
  app.delete('/api/sources/:id', async (req, reply) => {
    const user = req.authUser!;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin' });
    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'id required' });
    const src = db.select().from(schema.dataSources).where(eq(schema.dataSources.id, id)).limit(1).get();
    if (!src || src.twinId !== twin.id) return reply.code(404).send({ error: 'not found' });

    db.delete(schema.dataSources).where(eq(schema.dataSources.id, id)).run();
    if (src.filePath) {
      await fs.rm(join(uploadDir, src.filePath), { force: true }).catch(() => undefined);
    }
    logAudit(db, { userId: user.id, twinId: twin.id, action: 'source.deleted', entityType: 'data_sources', entityId: id });
    return { ok: true };
  });
}
