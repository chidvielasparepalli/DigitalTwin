import { createClient } from './client';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import { seedDatabase } from './seed-data';

const path = process.env.DATABASE_PATH ?? './data/twin.db';
const { client, sqlite } = createClient({ path });

// Ensure schema exists before seeding (idempotent).
migrate(client, { migrationsFolder: resolve(import.meta.dirname, '../drizzle') });

await seedDatabase(client);

sqlite.close();
console.log(`Seeded ${path}`);
