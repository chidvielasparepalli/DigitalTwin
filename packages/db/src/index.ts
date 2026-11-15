export * from './schema';
export { createDb, type Db, type DbOptions } from './connection';
export { createClient, type DrizzleClient, type DbClient } from './client';
export { applyMigrations } from './migrate';
export * from './repositories';
export { MemoryEngine, type MemoryQueryOptions, type ScoredMemory, openEngine } from './memory-engine';
export { PersonalityEngine, openPersonalityEngine } from './personality-engine';
export { CommunicationStyleEngine, openCommunicationStyleEngine } from './communication-style-engine';
export { KnowledgeGraphEngine, openKnowledgeGraphEngine, type KgEntity, type KgRelationship, type KgEntityType, type KgRelationshipType } from './knowledge-graph-engine';
export { DecisionEngine, openDecisionEngine, type DecisionPrediction } from './decision-engine';
export { BeliefEvolutionEngine, openBeliefEvolutionEngine, type BeliefEvolutionRecord } from './belief-evolution-engine';

// Re-export common query builders so consumers don't need a direct drizzle-orm dep.
export { eq, and, asc, desc, like, sql } from 'drizzle-orm';
export { count } from 'drizzle-orm';

/** Convenience row types derived from the schema. */
export type UserRow = typeof import('./schema').users.$inferSelect;
export type TwinRow = typeof import('./schema').twins.$inferSelect;
export type Decision = typeof import('./schema').decisions.$inferSelect;
export type Preference = typeof import('./schema').preferences.$inferSelect;
export type PersonalityTrait = typeof import('./schema').personalityTraits.$inferSelect;
export type CommunicationStyleRow = typeof import('./schema').communicationStyle.$inferSelect;
export type Conversation = typeof import('./schema').conversations.$inferSelect;
export type ConversationMessage = typeof import('./schema').conversationMessages.$inferSelect;
