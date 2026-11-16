// Public surface of @erp/business-logic, and the backend composition root (createManagers).
import {
  createDbClient,
  HealthQuery,
  AuthQuery,
  OrganizationQuery,
  ProductQuery,
  InventoryQuery,
  AccountingQuery,
  VehicleQuery,
  ReportQuery,
  PartyQuery,
  SalesQuery,
  PurchaseQuery,
  ServiceQuery,
  CrmQuery,
} from '@erp/dal';
import { HealthManager } from './HealthManager.js';
import { AuthManager } from './AuthManager.js';
import { OrganizationManager } from './OrganizationManager.js';
import { ProductManager } from './ProductManager.js';
import { InventoryManager } from './InventoryManager.js';
import { AccountingManager } from './AccountingManager.js';
import { VehicleManager } from './VehicleManager.js';
import { ReportManager } from './ReportManager.js';
import { PartyManager } from './PartyManager.js';
import { SalesManager } from './SalesManager.js';
import { PurchaseManager } from './PurchaseManager.js';
import { ServiceManager } from './ServiceManager.js';
import { CrmManager } from './CrmManager.js';
import { SystemClock } from './SystemClock.js';

export type { IClock } from './contracts/IClock.js';
export type { IHealthQuery } from './contracts/IHealthQuery.js';
export type { IAuthQuery } from './contracts/IAuthQuery.js';
export type { IOrganizationQuery } from './contracts/IOrganizationQuery.js';
export type { IProductQuery } from './contracts/IProductQuery.js';
export type { IInventoryQuery } from './contracts/IInventoryQuery.js';
export type { IAccountingQuery } from './contracts/IAccountingQuery.js';
export type { IVehicleQuery } from './contracts/IVehicleQuery.js';
export type { IReportQuery } from './contracts/IReportQuery.js';
export type { IPartyQuery } from './contracts/IPartyQuery.js';
export type { ISalesQuery } from './contracts/ISalesQuery.js';
export type { IPurchaseQuery } from './contracts/IPurchaseQuery.js';
export type { IServiceQuery } from './contracts/IServiceQuery.js';
export type { ICrmQuery } from './contracts/ICrmQuery.js';
export {
  HealthManager,
  AuthManager,
  OrganizationManager,
  ProductManager,
  InventoryManager,
  AccountingManager,
  VehicleManager,
  ReportManager,
  PartyManager,
  SalesManager,
  PurchaseManager,
  ServiceManager,
  CrmManager,
};

/** Every Manager, as built by createManagers. */
export interface Managers {
  health: HealthManager;
  auth: AuthManager;
  organization: OrganizationManager;
  product: ProductManager;
  inventory: InventoryManager;
  accounting: AccountingManager;
  vehicle: VehicleManager;
  report: ReportManager;
  party: PartyManager;
  sales: SalesManager;
  purchase: PurchaseManager;
  service: ServiceManager;
  crm: CrmManager;
}

export interface ManagerConfig {
  /** Application role URL (NOSUPERUSER, NOBYPASSRLS). */
  databaseUrl: string;
  version: string;
  /** Pool size and transaction timeout (ADR 0005); createDbClient's defaults when omitted. */
  dbPoolMax?: number;
  dbTxTimeoutMs?: number;
}

/**
 * Composition root: the ONLY place Queries and Managers are constructed (lint-enforced).
 * Each dal Query is passed where a businessLogic I<Module>Query is expected, so TypeScript checks
 * here that dal satisfies the contracts businessLogic owns, without dal importing businessLogic.
 */
export function createManagers(config: ManagerConfig): { managers: Managers; close: () => Promise<void> } {
  const db = createDbClient(config.databaseUrl, {
    poolMax: config.dbPoolMax,
    txTimeoutMs: config.dbTxTimeoutMs,
  });
  const managers: Managers = {
    health: new HealthManager(new HealthQuery(db), new SystemClock(), config.version),
    auth: new AuthManager(new AuthQuery(db)),
    organization: new OrganizationManager(new OrganizationQuery(db)),
    product: new ProductManager(new ProductQuery(db)),
    inventory: new InventoryManager(new InventoryQuery(db)),
    accounting: new AccountingManager(new AccountingQuery(db)),
    vehicle: new VehicleManager(new VehicleQuery(db)),
    report: new ReportManager(new ReportQuery(db)),
    party: new PartyManager(new PartyQuery(db)),
    sales: new SalesManager(new SalesQuery(db)),
    purchase: new PurchaseManager(new PurchaseQuery(db)),
    service: new ServiceManager(new ServiceQuery(db)),
    crm: new CrmManager(new CrmQuery(db)),
  };
  return { managers, close: () => db.$disconnect() };
}
