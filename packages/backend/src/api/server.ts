import { createManagers } from '@erp/business-logic';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const { managers, tenantScope, close } = createManagers({
  databaseUrl: env.DATABASE_URL,
  version: env.APP_VERSION,
});

const server = createApp({ logger, managers, tenantScope }).listen(env.API_PORT, () => {
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
