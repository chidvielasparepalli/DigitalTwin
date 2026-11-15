import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { PROVENANCE } from '@digital-twin/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Shared column builders
// ─────────────────────────────────────────────────────────────────────────────

const id = () => text('id').primaryKey();
const now = () => new Date();
const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(now),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(now),
};

/** Confidence + provenance appear on every piece of knowledge. */
const knowledge = {
  confidence: real('confidence').notNull().default(0),
  provenance: text('provenance').notNull().default(PROVENANCE.EXPLICIT),
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Users
// ─────────────────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Digital Twin profiles
// ─────────────────────────────────────────────────────────────────────────────

export const twins = sqliteTable('twins', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  preferredName: text('preferred_name'),
  description: text('description'),
  occupation: text('occupation'),
  preferredLanguages: text('preferred_languages', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Data sources (files, imports, manual entries that knowledge came from)
// ─────────────────────────────────────────────────────────────────────────────

export const dataSources = sqliteTable('data_sources', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  name: text('name').notNull(),
  sourceType: text('source_type')
    .notNull()
    .$type<'upload' | 'manual' | 'import' | 'chat'>()
    .default('upload'),
  status: text('status').$type<'uploaded' | 'processing' | 'processed' | 'failed'>().notNull().default('uploaded'),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  filePath: text('file_path'),
  checksum: text('checksum'),
  lastError: text('last_error'),
  ...timestamps,
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Personal information (structured facts about the person)
// ─────────────────────────────────────────────────────────────────────────────

export const personalInformation = sqliteTable('personal_information', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  field: text('field').notNull(), // e.g. occupation, home_city, birth_date
  value: text('value').notNull(),
  category: text('category'),
  /** current | historical — outdated info is kept, never silently overwritten */
  status: text('status').$type<'current' | 'historical'>().notNull().default('current'),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  ...timestamps,
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Memories
// ─────────────────────────────────────────────────────────────────────────────

export const memories = sqliteTable(
  'memories',
  {
    id: id(),
    twinId: text('twin_id')
      .notNull()
      .references(() => twins.id),
    type: text('type')
      .$type<'episodic' | 'semantic' | 'preference' | 'relationship' | 'decision' | 'temporal'>()
      .notNull(),
    content: text('content').notNull(),
    /** when the remembered event/state was true, distinct from created_at */
    eventAt: integer('event_at', { mode: 'timestamp' }),
    importance: real('importance').notNull().default(0.5),
    status: text('status').$type<'active' | 'invalidated' | 'archived'>().notNull().default('active'),
    sourceId: text('source_id').references(() => dataSources.id),
    embeddingRefId: text('embedding_ref_id').references(() => embeddingRefs.id),
    /** temporal memories only: window during which the memory is believed valid */
    validFrom: integer('valid_from', { mode: 'timestamp' }),
    validTo: integer('valid_to', { mode: 'timestamp' }),
    ...knowledge,
    ...timestamps,
  },
  (t) => [index('idx_memories_twin').on(t.twinId), index('idx_memories_twin_type').on(t.twinId, t.type)],
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Knowledge items (facts the person knows / holds)
// ─────────────────────────────────────────────────────────────────────────────

export const knowledgeItems = sqliteTable('knowledge_items', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  topic: text('topic').notNull(),
  content: text('content').notNull(),
  category: text('category'),
  status: text('status').$type<'active' | 'invalidated' | 'archived'>().notNull().default('active'),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  ...timestamps,
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Conversations + 8. messages
// ─────────────────────────────────────────────────────────────────────────────

export const conversations = sqliteTable('conversations', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  title: text('title'),
  sourceId: text('source_id').references(() => dataSources.id),
  startedAt: integer('started_at', { mode: 'timestamp' }).$defaultFn(now),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  createdAt: timestamps.createdAt,
});

export const conversationMessages = sqliteTable(
  'conversation_messages',
  {
    id: id(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: text('role').$type<'user' | 'assistant' | 'system'>().notNull(),
    content: text('content').notNull(),
    embeddingRefId: text('embedding_ref_id').references(() => embeddingRefs.id),
    ...knowledge,
    createdAt: timestamps.createdAt,
  },
  (t) => [index('idx_messages_conversation').on(t.conversationId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. Preferences
// ─────────────────────────────────────────────────────────────────────────────

export const preferences = sqliteTable('preferences', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  category: text('category').notNull(),
  item: text('item').notNull(),
  preference: text('preference').$type<'like' | 'dislike' | 'neutral' | 'avoid'>().notNull(),
  strength: real('strength').notNull().default(0.5),
  status: text('status').$type<'active' | 'superseded'>().notNull().default('active'),
  // Self-referencing FK for preference evolution tracking
  evolvedFromId: text('evolved_from_id').references(() => preferences.id),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  ...timestamps,
});

// Type for the inferred row - explicit annotation to break circular reference
export type PreferenceRow = typeof preferences.$inferSelect;

// Type for the seed function
export type SeedData = typeof import('./seed-data').seedDatabase;

// ─────────────────────────────────────────────────────────────────────────────
// 10. Personality traits
// ─────────────────────────────────────────────────────────────────────────────

export const personalityTraits = sqliteTable('personality_traits', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  trait: text('trait').notNull(), // e.g. directness, humor, risk_tolerance
  /** normalized 0..1 value of the trait */
  value: real('value').notNull(),
  /** JSON array of {text, sourceId} evidence fragments */
  evidence: text('evidence', { mode: 'json' }).$type<{ text: string; sourceId?: string }[]>().notNull().default([]),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  createdAt: timestamps.createdAt,
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).$defaultFn(now),
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Communication-style characteristics
// ─────────────────────────────────────────────────────────────────────────────

export const communicationStyle = sqliteTable('communication_style', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  characteristic: text('characteristic').notNull(), // e.g. avg_message_length, emoji_usage
  /** JSON value: scalar or distribution (e.g. {avg: 42, std: 8}) */
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  evidence: text('evidence', { mode: 'json' }).$type<{ text: string; sourceId?: string }[]>().notNull().default([]),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  createdAt: timestamps.createdAt,
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).$defaultFn(now),
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Relationships (between people)
// ─────────────────────────────────────────────────────────────────────────────

export const relationships = sqliteTable('relationships', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  personName: text('person_name').notNull(),
  relationType: text('relation_type'), // family, friend, colleague, ...
  importance: real('importance').notNull().default(0.5),
  notes: text('notes'),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  ...timestamps,
});

// ─────────────────────────────────────────────────────────────────────────────
// 21. Knowledge Graph Entities
// ─────────────────────────────────────────────────────────────────────────────

export const kgEntities = sqliteTable('kg_entities', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // PERSON, PROJECT, PLACE, ORGANIZATION, SKILL, INTEREST, EVENT, GOAL, PREFERENCE, DECISION
  description: text('description'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge, // confidence and provenance for entity existence/type
  ...timestamps,
});

// ─────────────────────────────────────────────────────────────────────────────
// 22. Knowledge Graph Relationships
// ─────────────────────────────────────────────────────────────────────────────

export const kgRelationships = sqliteTable('kg_relationships', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  sourceEntityId: text('source_entity_id')
    .notNull()
    .references(() => kgEntities.id),
  targetEntityId: text('target_entity_id')
    .notNull()
    .references(() => kgEntities.id),
  type: text('type').notNull(), // WORKED_ON, KNOWS, PREFERS, MADE, RESULTED_IN
  description: text('description'),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge, // confidence and provenance for relationship existence/type
  ...timestamps,
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Life events
// ─────────────────────────────────────────────────────────────────────────────

export const lifeEvents = sqliteTable('life_events', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  title: text('title').notNull(),
  description: text('description'),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }),
  importance: real('importance').notNull().default(0.5),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  createdAt: timestamps.createdAt,
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Decisions + 15. outcomes
// ─────────────────────────────────────────────────────────────────────────────

export const decisions = sqliteTable('decisions', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  description: text('description').notNull(),
  context: text('context'),
  /** JSON array of option strings considered */
  options: text('options', { mode: 'json' }).$type<string[]>().notNull().default([]),
  chosen: text('chosen'),
  rationale: text('rationale'),
  decisionDate: integer('decision_date', { mode: 'timestamp' }),
  status: text('status').$type<'active' | 'revised'>().notNull().default('active'),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  ...timestamps,
});

export const decisionOutcomes = sqliteTable('decision_outcomes', {
  id: id(),
  decisionId: text('decision_id')
    .notNull()
    .references(() => decisions.id),
  outcome: text('outcome').notNull(),
  evaluation: text('evaluation').$type<'positive' | 'negative' | 'neutral'>().notNull().default('neutral'),
  notes: text('notes'),
  sourceId: text('source_id').references(() => dataSources.id),
  ...knowledge,
  createdAt: timestamps.createdAt,
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Embedding references (pointer for vector search)
// ─────────────────────────────────────────────────────────────────────────────

export const embeddingRefs = sqliteTable('embedding_refs', {
  id: id(),
  /** polymorphic: memories.id, knowledge_items.id, conversation_messages.id, ... */
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  model: text('model').notNull(),
  dimensions: integer('dimensions').notNull(),
  /** JSON float array — replaced by native vector type on Postgres */
  vector: text('vector', { mode: 'json' }).$type<number[]>().notNull(),
  createdAt: timestamps.createdAt,
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. AI-generated inferences (every inference, auditable + correctable)
// ─────────────────────────────────────────────────────────────────────────────

export const inferences = sqliteTable('inferences', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  targetType: text('target_type').notNull(), // personality_traits, preferences, ...
  targetId: text('target_id').notNull(),
  inferenceType: text('inference_type').notNull(), // what kind of inference
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  confidence: real('confidence').notNull(),
  /** JSON array of supporting evidence fragments */
  evidence: text('evidence', { mode: 'json' }).$type<{ text: string; sourceId?: string }[]>().notNull().default([]),
  model: text('model'),
  status: text('status').$type<'pending' | 'accepted' | 'corrected' | 'rejected'>().notNull().default('pending'),
  sourceId: text('source_id').references(() => dataSources.id),
  createdAt: timestamps.createdAt,
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Confidence scores (snapshots over time, for calibration)
// ─────────────────────────────────────────────────────────────────────────────

export const confidenceScores = sqliteTable('confidence_scores', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  score: real('score').notNull(),
  source: text('source'), // where the score came from
  assessedAt: integer('assessed_at', { mode: 'timestamp' }).$defaultFn(now),
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. Audit logs
// ─────────────────────────────────────────────────────────────────────────────

export const auditLogs = sqliteTable('audit_logs', {
  id: id(),
  twinId: text('twin_id').references(() => twins.id),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: text('details', { mode: 'json' }).$type<Record<string, unknown>>(),
  ip: text('ip'),
  createdAt: timestamps.createdAt,
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. Permissions (what the Twin may do)
// ─────────────────────────────────────────────────────────────────────────────

export const permissions = sqliteTable('permissions', {
  id: id(),
  twinId: text('twin_id')
    .notNull()
    .references(() => twins.id),
  /** action key, e.g. calendar.read, email.send, money.transfer */
  action: text('action').notNull(),
  /** read | suggest | ask_confirmation | execute | blocked */
  level: text('level').$type<'read' | 'suggest' | 'ask_confirmation' | 'execute' | 'blocked'>().notNull(),
  scope: text('scope'), // e.g. a domain or resource
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});
