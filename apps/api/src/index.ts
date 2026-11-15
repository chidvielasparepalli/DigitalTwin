import { buildApp } from './app';
import { loadConfig } from './config';
import { createClient, applyMigrations } from '@digital-twin/db';

const config = loadConfig();
const { client } = createClient({ path: config.databasePath });
applyMigrations(client); // ensure schema exists on boot (idempotent)
const app = buildApp({ config, client });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
