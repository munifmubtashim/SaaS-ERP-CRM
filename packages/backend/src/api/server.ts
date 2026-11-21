import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const { managers, close } = createManagers({
  databaseUrl: env.DATABASE_URL,
  version: env.APP_VERSION,
  dbPoolMax: env.DB_POOL_MAX,
  dbTxTimeoutMs: env.DB_TX_TIMEOUT_MS,
  provisioningDatabaseUrl: env.PROVISIONING_DATABASE_URL,
  // Until A5 reads roles from the session (ADR 0010, decided by Farhan on #32): nobody may provision yet.
  roleSource: new DenyAllRoleSource(),
});

const server = createApp({ logger, managers }).listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'api listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'api shutting down');
  server.close(() => {
    void close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
