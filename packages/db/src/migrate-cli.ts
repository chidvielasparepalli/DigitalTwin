import { createClient } from './client';
import { applyMigrations } from './migrate';

const path = process.env.DATABASE_PATH ?? './data/twin.db';
const { client, sqlite } = createClient({ path });
applyMigrations(client);
sqlite.close();
console.log(`Migrations applied to ${path}`);
