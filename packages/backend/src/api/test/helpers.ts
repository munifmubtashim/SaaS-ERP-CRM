import { createManagers, HealthManager, type Managers } from '@erp/business-logic';
import { createLogger } from '../config/logger.js';

export const silentLogger = createLogger({ level: 'silent', pretty: false });

/**
 * Real Managers wired to an unreachable database (Prisma connects lazily, so nothing connects),
 * with HealthManager swapped for one whose database answer the test chooses.
 */
export function managersWithDatabase(databaseOk: boolean): Managers {
  const { managers } = createManagers({
    databaseUrl: 'postgresql://nobody@127.0.0.1:1/none',
    version: 'test',
  });
  managers.health = new HealthManager({ ping: async () => ({ databaseOk, latencyMs: 1 }) }, 'test');
  return managers;
}
