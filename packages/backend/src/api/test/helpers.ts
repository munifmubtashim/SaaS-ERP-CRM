import { createLogger } from '../config/logger.js';
import { AppError } from '@erp/shared';
import type {
  ApiManagers,
  IAuthManager,
  IHealthManager,
  ITenantScopeRunner,
} from '../controllers/contracts/index.js';

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

/** An auth Manager for tests that never log in: using it is a test bug, so it fails loudly. */
export const unusedAuth: IAuthManager = {
  login: () => Promise.reject(new AppError('INTERNAL_ERROR', 'This test logged in without an auth Manager.')),
};

/** ApiManagers made of fakes. Stub modules have empty contracts, so `{}` satisfies them. */
export function fakeManagers(health: IHealthManager): ApiManagers {
  return {
    health,
    auth: unusedAuth,
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

/** Tenant runner for tests that open no tenant scope: using it is a test bug, so it fails loudly. */
export const noTenantScope: ITenantScopeRunner = {
  run: () =>
    Promise.reject(new AppError('INTERNAL_ERROR', 'This test opened a tenant scope it did not expect.')),
};
