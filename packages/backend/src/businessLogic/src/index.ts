// Public surface of @erp/business-logic. The api layer imports only from here.
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

/** Every Manager the API can call. api receives this object and never sees dal. */
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
}

/**
 * Composition root of the backend: builds the dal client and Queries, and hands each Manager its
 * Query. It lives here so the api layer depends only on businessLogic (api -> businessLogic -> dal).
 */
export function createManagers(config: ManagerConfig): { managers: Managers; close: () => Promise<void> } {
  const db = createDbClient(config.databaseUrl);
  const managers: Managers = {
    health: new HealthManager(new HealthQuery(db), config.version),
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
