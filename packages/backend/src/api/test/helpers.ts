import { createLogger } from '../config/logger.js';
import { AppError } from '@erp/shared';
import type {
  ApiManagers,
  IAuthManager,
  IHealthManager,
  IIdempotency,
  IInventoryManager,
  IProductManager,
  IReportManager,
  ISalesManager,
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
  authenticate: () => Promise.reject(new AppError('UNAUTHENTICATED', 'Sign in again.')),
  logout: () => Promise.resolve(),
  resolveScope: () => Promise.reject(new AppError('NOT_FOUND', 'Business or branch not found.')),
  myBusinesses: () =>
    Promise.reject(new AppError('INTERNAL_ERROR', 'This test did not expect GET /v1/me/businesses.')),
};

const unexpected = (what: string) => () =>
  Promise.reject(new AppError('INTERNAL_ERROR', `This test did not expect a ${what} request.`));

/** A product Manager for tests that never touch products: using it fails loudly. */
export const unusedProduct: IProductManager = {
  list: unexpected('product'),
  get: unexpected('product'),
  create: unexpected('product'),
  edit: unexpected('product'),
};

/** An idempotency guard for apps whose tests never call an idempotent route: using it fails loudly. */
export const unusedIdempotency: IIdempotency = {
  claim: () => unexpected('idempotent')(),
  complete: () => unexpected('idempotent')(),
};

/** An Inventory Manager for tests that never read stock: using it fails loudly. */
export const unusedInventory: IInventoryManager = {
  list: unexpected('inventory'),
  posCatalog: unexpected('inventory'),
};

/** A Report Manager for tests that never read a report: using it fails loudly. */
export const unusedReport: IReportManager = { ownerDashboard: unexpected('report') };

/** A Sales Manager for tests that never post a sale: using it fails loudly. */
export const unusedSales: ISalesManager = { postInvoice: unexpected('sales') };

/** ApiManagers made of fakes. Stub modules have empty contracts, so `{}` satisfies them. */
export function fakeManagers(health: IHealthManager): ApiManagers {
  return {
    health,
    auth: unusedAuth,
    organization: {},
    product: unusedProduct,
    inventory: unusedInventory,
    accounting: {},
    vehicle: {},
    report: unusedReport,
    party: {},
    sales: unusedSales,
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
