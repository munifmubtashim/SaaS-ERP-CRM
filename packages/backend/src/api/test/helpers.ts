import { createLogger } from '../config/logger.js';
import type { ApiManagers, IHealthManager } from '../controllers/contracts/index.js';

export const silentLogger = createLogger({ level: 'silent', pretty: false });

/** Fake IHealthManager: the api layer only knows the interface, so tests need no database. */
export class FakeHealthManager implements IHealthManager {
  constructor(private readonly databaseOk: boolean) {}
  async getHealth() {
    return {
      status: this.databaseOk ? ('ok' as const) : ('degraded' as const),
      version: 'test',
      time: '2026-11-14T06:00:00.000Z',
      checks: { database: this.databaseOk ? ('ok' as const) : ('down' as const) },
    };
  }
}

/** ApiManagers made of fakes. Stub modules have empty contracts, so `{}` satisfies them. */
export function fakeManagers(health: IHealthManager): ApiManagers {
  return {
    health,
    auth: {},
    organization: {},
    product: {},
    inventory: {},
    accounting: {},
    vehicle: {},
    report: {},
    party: {},
    sales: {},
    purchase: {},
    service: {},
    crm: {},
  };
}

export const managersWithDatabase = (databaseOk: boolean): ApiManagers =>
  fakeManagers(new FakeHealthManager(databaseOk));
