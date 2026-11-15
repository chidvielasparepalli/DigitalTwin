import type { AiProvider } from '@digital-twin/ai';
import { type KgEntityType, type KgRelationshipType, PROVENANCE } from '@digital-twin/shared'; // Using KgEntityType from shared

export interface ExtractedKgEntity {
  name: string;
  type: KgEntityType;
  description?: string;
  metadata?: Record<string, unknown>;
  confidence?: number;
}

export interface ExtractedKgRelationship {
  sourceEntityName: string; // Name of the source entity
  targetEntityName: string; // Name of the target entity
  type: KgRelationshipType;
  description?: string;
  confidence?: number;
}

export interface ExtractedKgData {
  entities: ExtractedKgEntity[];
  relationships: ExtractedKgRelationship[];
}

const KG_SYSTEM_PROMPT = `
You are an expert knowledge graph extractor. Your task is to identify key entities and the relationships between them from the provided text.
Strictly output your response as a JSON object, adhering to the following TypeScript interfaces:

interface ExtractedKgEntity {
  name: string; // The name of the entity
  type: "PERSON" | "PROJECT" | "PLACE" | "ORGANIZATION" | "SKILL" | "INTEREST" | "EVENT" | "GOAL" | "PREFERENCE" | "DECISION";
  description?: string; // A brief description of the entity
  metadata?: Record<string, unknown>; // Any additional relevant structured data
  confidence?: number; // (0-1) How confident are you in this extraction?
}

interface ExtractedKgRelationship {
  sourceEntityName: string; // The name of the source entity in the relationship
  targetEntityName: string; // The name of the target entity in the relationship
  type: "WORKED_ON" | "KNOWS" | "PREFERS" | "MADE" | "RESULTED_IN" | "HAS_INTEREST_IN" | "HAS_SKILL_IN" | "LIVES_IN" | "WORKS_AT" | "STUDIED_AT" | "ATTENDED" | "FOUNDED" | "OWNS" | "PARTICIPATED_IN";
  description?: string; // A brief description of the relationship
  confidence?: number; // (0-1) How confident are you in this extraction?
}

interface ExtractedKgData {
  entities: ExtractedKgEntity[];
  relationships: ExtractedKgRelationship[];
}

Ensure that all 'name' fields for entities and relationships are consistent. If you extract a relationship between two entities, both entities must also be present in the 'entities' array.

Categorize entities as:
- PERSON: An individual.
- PROJECT: A project or initiative.
- PLACE: A geographical location (city, country, specific venue).
- ORGANIZATION: A company, institution, or group.
- SKILL: A specific ability or expertise.
- INTEREST: A hobby or area of personal enjoyment.
- EVENT: A notable occurrence or happening.
- GOAL: An objective or aspiration.
- PREFERENCE: A stated like or dislike.
- DECISION: A significant choice made.

Categorize relationships as:
- WORKED_ON: Person worked on a project.
- KNOWS: Person knows another person or a skill/topic.
- PREFERS: Person prefers something.
- MADE: Person made a decision.
- RESULTED_IN: Decision resulted in an outcome.
- HAS_INTEREST_IN: Person has interest in a topic/activity.
- HAS_SKILL_IN: Person possesses a skill.
- LIVES_IN: Person lives in a place.
- WORKS_AT: Person works at an organization.
- STUDIED_AT: Person studied at an institution.
- ATTENDED: Person attended an event/institution.
- FOUNDED: Person founded an organization/project.
- OWNS: Person owns something.
- PARTICIPATED_IN: Person participated in an event/project.

If no entities or relationships are found, return empty arrays: { "entities": [], "relationships": [] }.
Be concise and extract only the most salient entities and relationships.
All confidence scores should be between 0 and 1. If not specified, default confidence to 0.7.
`;

const KG_JSON_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ["PERSON", "PROJECT", "PLACE", "ORGANIZATION", "SKILL", "INTEREST", "EVENT", "GOAL", "PREFERENCE", "DECISION"] },
          description: { type: 'string', nullable: true },
          metadata: { type: 'object', nullable: true },
          confidence: { type: 'number', minimum: 0, maximum: 1, nullable: true },
        },
        required: ['name', 'type'],
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceEntityName: { type: 'string' },
          targetEntityName: { type: 'string' },
          type: { type: 'string', enum: ["WORKED_ON", "KNOWS", "PREFERS", "MADE", "RESULTED_IN", "HAS_INTEREST_IN", "HAS_SKILL_IN", "LIVES_IN", "WORKS_AT", "STUDIED_AT", "ATTENDED", "FOUNDED", "OWNS", "PARTICIPATED_IN"] },
          description: { type: 'string', nullable: true },
          confidence: { type: 'number', minimum: 0, maximum: 1, nullable: true },
        },
        required: ['sourceEntityName', 'targetEntityName', 'type'],
      },
    },
  },
  required: ['entities', 'relationships'],
};

export async function extractKgEntitiesAndRelationships(
  aiProvider: AiProvider,
  text: string,
): Promise<ExtractedKgData | null> {
  const userPrompt = `Extract knowledge graph entities and relationships from the following text:\n\n"${text}"`;
  const result = await aiProvider.extractJson<ExtractedKgData>(KG_SYSTEM_PROMPT, userPrompt, KG_JSON_SCHEMA);

  // Ensure confidence is set for all extracted items
  if (result) {
    result.entities = result.entities.map(e => ({ ...e, confidence: e.confidence ?? 0.7 }));
    result.relationships = result.relationships.map(r => ({ ...r, confidence: r.confidence ?? 0.7 }));
  }
  return result;
}