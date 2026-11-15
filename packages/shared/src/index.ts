/**
 * Shared constants and types used across the Digital Twin codebase.
 * Extended in later phases (permission levels, memory types, trait dimensions...).
 */

export const APP_NAME = 'Digital Twin';
export const DEFAULT_LANGUAGE = 'en';

/** Severity tiers for provenance: how much we can trust a piece of information. */
export const PROVENANCE = {
  /** Explicitly provided by the user. Highest trust. */
  EXPLICIT: 'explicit',
  /** Inferred by AI from approved data. Must carry evidence + confidence. */
  INFERRED: 'inferred',
} as const;

export type Provenance = (typeof PROVENANCE)[keyof typeof PROVENANCE];

/** Core personality traits for the twin. */
export const PERSONALITY_TRAITS = [
  'communication_style', 'formality', 'humor', 'directness', 'emotional_expressiveness',
  'risk_tolerance', 'patience', 'decision_confidence', 'social_behavior',
  'technical_language_usage', 'typical_response_length', 'preferred_vocabulary',
  'values', 'priorities', 'dislikes', 'behavioral_tendencies'
] as const;

export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

/** Knowledge Graph entity types. */
export type KgEntityType =
  | 'PERSON'
  | 'PROJECT'
  | 'PLACE'
  | 'ORGANIZATION'
  | 'SKILL'
  | 'INTEREST'
  | 'EVENT'
  | 'GOAL'
  | 'PREFERENCE'
  | 'DECISION';

/** Knowledge Graph relationship types. */
export type KgRelationshipType =
  | 'WORKED_ON'
  | 'KNOWS'
  | 'PREFERS'
  | 'MADE'
  | 'RESULTED_IN'
  | 'LOCATED_AT'
  | 'MEMBER_OF'
  | 'RELATED_TO';
