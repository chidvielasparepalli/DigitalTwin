import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import {
  twinsRepo,
  logAudit,
  type DrizzleClient,
  type UserRow,
  conversationsRepo,
  and,
  type Conversation,
  type ConversationMessage,
} from '@digital-twin/db';
import * as schema from '@digital-twin/db';
import { authenticate } from './auth';
import { TwinBrain } from '@digital-twin/ai';
import { createProvider, type AiProvider } from '@digital-twin/ai';

// Helper to get AI provider, if key is available
function maybeProvider(): AiProvider | undefined {
  const key = process.env.OPENAI_API_KEY;
  return key ? createProvider({ apiKey: key }) : undefined;
}

export function registerTwinBrain(app: FastifyInstance, db: DrizzleClient): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/twin-brain')) return;
    await authenticate(req, reply);
  });

  // ── Process User Input ──────────────────────────────────────────────────────
  app.post('/api/twin-brain/process', async (req, reply) => {
    const user = req.authUser as UserRow;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin found for user' });

    const body = req.body as { query?: string; conversationId?: string };
    if (!body.query || !body.query.trim()) {
      return reply.code(400).send({ error: 'query is required' });
    }

    const aiProvider = maybeProvider();
    if (!aiProvider) {
        return reply.code(500).send({ error: 'AI provider not configured (OPENAI_API_KEY missing)' });
    }

    const twinBrain = new TwinBrain(db, aiProvider);

    let conversation: Conversation | undefined;
    if (body.conversationId) {
      conversation = conversationsRepo.byId(db, twin.id, body.conversationId);
      if (!conversation) {
        return reply.code(404).send({ error: 'conversation not found' });
      }
    } else {
      // Create a new conversation if no ID is provided
      conversation = await conversationsRepo.create(db, twin.id, {
        title: body.query.substring(0, 50) + '...', // Initial title
      });
    }

    // Save user message
    db.insert(schema.conversationMessages).values({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role: 'user',
      content: body.query,
      createdAt: new Date(),
    }).run();

    try {
      const output = await twinBrain.processInput({ userId: user.id, twinId: twin.id, query: body.query });

      // Save twin's response
      db.insert(schema.conversationMessages).values({
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        role: 'assistant',
        content: output.response,
        createdAt: new Date(),
      }).run();

      logAudit(db, {
        userId: user.id,
        twinId: twin.id,
        action: 'twin_brain.process_input',
        entityType: 'conversation_messages',
        entityId: conversation.id, // Log against the conversation
        details: { query: body.query, response: output.response, confidence: output.confidence },
      });

      return reply.code(200).send({ ...output, conversationId: conversation.id });
    } catch (error) {
      app.log.error(error, 'Twin Brain processing failed');
      // Save error message as a twin's response for context
      db.insert(schema.conversationMessages).values({
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        role: 'assistant',
        content: `Error: Failed to process input through Twin Brain. ${error instanceof Error ? error.message : String(error)}`,
        createdAt: new Date(),
      }).run();

      return reply.code(500).send({ error: 'Failed to process input through Twin Brain' });
    }
  });

  // ── Get Conversation History ────────────────────────────────────────────────
  app.get('/api/twin-brain/conversations', async (req, reply) => {
    const user = req.authUser as UserRow;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin found for user' });

    // @ts-expect-error drizzle-orm type issue with string column
const conversations = await db.select().from(schema.conversations).where(eq(schema.conversations.twinId, twin.id)).orderBy(schema.conversations.startedAt, 'desc').all() as Conversation[];
    return conversations;
  });

  app.get('/api/twin-brain/conversations/:id/messages', async (req, reply) => {
    const user = req.authUser as UserRow;
    const twin = twinsRepo.list(db, user.id)[0];
    if (!twin) return reply.code(404).send({ error: 'no twin found for user' });

    const { id } = req.params as { id?: string };
    if (!id) return reply.code(400).send({ error: 'conversation ID is required' });

    const conversation = conversationsRepo.byId(db, twin.id, id);
    if (!conversation) return reply.code(404).send({ error: 'conversation not found' });

    // @ts-expect-error drizzle-orm type issue with string column
const messages = await db.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.conversationId, id)).orderBy(schema.conversationMessages.createdAt, 'asc').all() as ConversationMessage[];
    return { conversation, messages };
  });
}