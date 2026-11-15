import { hashSync } from 'bcryptjs';
import type { DrizzleClient } from './client';
import * as schema from './schema';
import { PROVENANCE } from '@digital-twin/shared';
import { usersRepo, twinsRepo, upsertPreference, createInference } from './repositories';

/** Demo credentials: demo@digitaltwin.dev / demo1234 */
const DEMO_PASSWORD_HASH = hashSync('demo1234', 10);

/**
 * Demo data showing the architecture's principles:
 * - explicit facts vs AI inferences are separate entities
 * - outdated info is superseded, not deleted
 * - every inference carries evidence + confidence + source
 */
export async function seedDatabase(tx: DrizzleClient): Promise<void> {
  const existing = usersRepo.byEmail(tx, 'demo@digitaltwin.dev');
  if (existing) {
    console.log('Seed already present — skipping.');
    return;
  }

  const user = usersRepo.create(tx, {
    email: 'demo@digitaltwin.dev',
    name: 'Aravind Sharma',
    passwordHash: DEMO_PASSWORD_HASH,
  });

  const twin = await twinsRepo.create(tx, user.id, {
    name: 'Aravind',
    preferredName: 'Arvi',
    description: 'Demo twin for the Digital Twin platform',
    occupation: 'Software Engineer',
    preferredLanguages: ['English', 'Telugu'],
  });

  // Data source backing the below facts.
  const source = tx
    .insert(schema.dataSources)
    .values({
      id: crypto.randomUUID(),
      twinId: twin.id,
      name: 'Onboarding answers',
      sourceType: 'manual',
      status: 'processed',
    })
    .returning()
    .get()!;

  // Explicit personal information.
  tx.insert(schema.personalInformation)
    .values([
      { id: crypto.randomUUID(), twinId: twin.id, field: 'home_city', value: 'Hyderabad', category: 'location', sourceId: source.id, provenance: PROVENANCE.EXPLICIT, confidence: 1 },
      { id: crypto.randomUUID(), twinId: twin.id, field: 'occupation', value: 'Software Engineer', category: 'career', sourceId: source.id, provenance: PROVENANCE.EXPLICIT, confidence: 1 },
      { id: crypto.randomUUID(), twinId: twin.id, field: 'years_experience', value: '7', category: 'career', sourceId: source.id, provenance: PROVENANCE.EXPLICIT, confidence: 1 },
    ])
    .run();

  // Memories across types.
  tx.insert(schema.memories)
    .values([
      {
        id: crypto.randomUUID(), twinId: twin.id, type: 'episodic', content: 'Went to Goa with college friends in Dec 2024.',
        eventAt: new Date('2024-12-20'), importance: 0.8, sourceId: source.id, provenance: PROVENANCE.EXPLICIT, confidence: 1,
      },
      {
        id: crypto.randomUUID(), twinId: twin.id, type: 'semantic', content: 'Knows TypeScript, React, Node and PostgreSQL well.',
        importance: 0.9, sourceId: source.id, provenance: PROVENANCE.EXPLICIT, confidence: 0.95,
      },
      {
        id: crypto.randomUUID(), twinId: twin.id, type: 'relationship', content: 'Sister Ananya lives in Bangalore.',
        importance: 0.9, sourceId: source.id, provenance: PROVENANCE.EXPLICIT, confidence: 1,
      },
      {
        id: crypto.randomUUID(), twinId: twin.id, type: 'decision', content: 'Chose remote-first job over higher in-office offer in 2023.',
        eventAt: new Date('2023-06-01'), importance: 0.85, sourceId: source.id, provenance: PROVENANCE.EXPLICIT, confidence: 0.95,
      },
    ])
    .run();

  // Preferences, one explicit + one that gets superseded later to show evolution.
  await upsertPreference(tx, twin.id, { category: 'work', item: 'remote_work', preference: 'like', strength: 0.9, confidence: 1 });
  await upsertPreference(tx, twin.id, { category: 'lifestyle', item: 'mornings', preference: 'like', strength: 0.6, confidence: 0.8 });

  // Knowledge item.
  tx.insert(schema.knowledgeItems)
    .values({
      id: crypto.randomUUID(), twinId: twin.id, topic: 'Career', content: 'Has 7 years of experience building web applications.',
      category: 'career', sourceId: source.id, provenance: PROVENANCE.EXPLICIT, confidence: 1,
    })
    .run();

  // Decisions + outcomes.
  const decision = tx
    .insert(schema.decisions)
    .values({
      id: crypto.randomUUID(), twinId: twin.id,
      description: 'Choose between two job offers in 2023',
      context: 'Offer A: remote, 15 LPA. Offer B: in-office Bangalore, 22 LPA.',
      options: ['Remote 15 LPA', 'In-office 22 LPA'],
      chosen: 'Remote 15 LPA',
      rationale: 'Prioritizes flexibility and family time over higher pay.',
      decisionDate: new Date('2023-06-01'),
      provenance: PROVENANCE.EXPLICIT, confidence: 1,
    })
    .returning()
    .get();

  tx.insert(schema.decisionOutcomes)
    .values({
      id: crypto.randomUUID(), decisionId: decision.id, outcome: 'Stayed with the remote company for 2 years, promoted twice.',
      evaluation: 'positive', provenance: PROVENANCE.EXPLICIT, confidence: 1,
    })
    .run();

  // An AI inference — kept separate from explicit facts, with evidence + confidence.
  createInference(tx, {
    twinId: twin.id,
    targetType: 'preferences',
    targetId: crypto.randomUUID(), // placeholder; real inference targets the preference row
    inferenceType: 'preference_inference',
    value: { item: 'coffee', preference: 'like', strength: 0.7 },
    confidence: 0.65,
    evidence: [
      { text: 'Mentioned preferring strong coffee in onboarding answers.', sourceId: source.id },
    ],
    model: 'gpt-4o-mini',
    sourceId: source.id,
  });

  // Permission scaffold (Phase 15 fills this out).
  tx.insert(schema.permissions)
    .values({
      id: crypto.randomUUID(), twinId: twin.id, action: 'calendar.read', level: 'read', scope: 'personal',
    })
    .run();

  // Audit trail for the whole setup.
  tx.insert(schema.auditLogs)
    .values({
      id: crypto.randomUUID(), userId: user.id, twinId: twin.id, action: 'twin.created', entityType: 'twins', entityId: twin.id,
      details: { via: 'seed' },
    })
    .run();
}
