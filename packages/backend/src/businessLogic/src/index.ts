// Public surface of @erp/business-logic, and the backend composition root (createManagers).
import {
  createDbClient,
  NumberSeriesQuery,
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
  createProvisioningQuery,
  TenantScopeRunner,
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
import { NumberSeries } from './NumberSeries.js';
import type { INumberSeries } from './contracts/provided/INumberSeries.js';
import { SessionTokens } from './SessionTokens.js';
import type { SessionLifetimes } from './AuthManager.js';
import { Argon2PasswordHasher } from './Argon2PasswordHasher.js';
import { DenyAllRoleSource } from './DenyAllRoleSource.js';
import type { IRoleSource } from './contracts/IRoleSource.js';
import type { ITenantScope } from './contracts/ITenantScope.js';

export type { IClock } from './contracts/IClock.js';
export type { ITenantScope } from './contracts/ITenantScope.js';
export type { IHealthQuery } from './contracts/IHealthQuery.js';
export type { ActiveSession, IAuthQuery, LoginUser, NewSession, UserRef } from './contracts/IAuthQuery.js';
export type { IPasswordHasher } from './contracts/IPasswordHasher.js';
export type { AuthenticatedSession, LoginOutcome, SessionLifetimes, VerifiedLogin } from './AuthManager.js';
export type { ISessionTokens } from './contracts/ISessionTokens.js';
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
export type { IProvisioningQuery } from './contracts/IProvisioningQuery.js';
export type { IRoleSource } from './contracts/IRoleSource.js';
export type { IIdempotencyQuery, ClaimInput, StoredKey } from './contracts/IIdempotencyQuery.js';
export type { INumberSeriesQuery, TakenNumber } from './contracts/INumberSeriesQuery.js';
export type { INumberSeries, NumberSeriesKind } from './contracts/provided/INumberSeries.js';
export { NUMBER_SERIES_KINDS } from './contracts/provided/INumberSeries.js';
export type {
  IPostingService,
  JournalDraft,
  JournalLineDraft,
  AccountRole,
  PostedJournal,
} from './contracts/provided/IPostingService.js';
export type { IStockService, StockMovementDraft } from './contracts/provided/IStockService.js';
export { NumberSeries } from './NumberSeries.js';
export {
  IdempotencyGuard,
  canonicalHash,
  type ClaimResult,
  type IdempotentRequest,
} from './IdempotencyGuard.js';
export type { ProvisioningCaller } from './OrganizationManager.js';
export { DenyAllRoleSource };
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

/** ADR 0018 section 3: idle 8 hours, absolute 7 days. */
export const DEFAULT_SESSION_LIFETIMES: SessionLifetimes = {
  idleMs: 8 * 3_600_000,
  absoluteMs: 7 * 24 * 3_600_000,
};

export interface ManagerConfig {
  /** Application role URL (NOSUPERUSER, NOBYPASSRLS). */
  databaseUrl: string;
  version: string;
  /** Pool size and transaction timeout (ADR 0005); the defaults live in the api's env.ts. */
  dbPoolMax: number;
  dbTxTimeoutMs: number;
  /**
   * The erp_provisioner URL (ADR 0010). Optional outside production (env.ts enforces it there); without it,
   * creating a business or branch answers 503 provisioning.not_configured.
   */
  provisioningDatabaseUrl?: string;
  /**
   * The caller's roles (ADR 0010 part 2). Required: createManagers throws without one and never defaults to
   * "allowed". Until A5, pass a DenyAllRoleSource.
   */
  roleSource: IRoleSource;
  /** Session lifetimes (ADR 0018 section 3); the api reads them from env.ts. Default: 8 hours idle, 7 days absolute. */
  sessionLifetimes?: SessionLifetimes;
}

/**
 * Composition root: the ONLY place Queries and Managers are constructed (lint-enforced).
 * Each dal Query is passed where a businessLogic I<Module>Query is expected, so TypeScript checks
 * here that dal satisfies the contracts businessLogic owns, without dal importing businessLogic.
 * `tenantScope` opens the one transaction per tenant request (ADR 0005); the api route wrapper uses it.
 */
export function createManagers(config: ManagerConfig): {
  managers: Managers;
  /** Services one module publishes for others (ADR 0012): Accounting's gapless numbers (ADR 0015). */
  provided: { numberSeries: INumberSeries };
  tenantScope: ITenantScope;
  close: () => Promise<void>;
} {
  if (!config.roleSource) {
    throw new Error('createManagers needs a role source (ADR 0010); pass DenyAllRoleSource until A5.');
  }
  const db = createDbClient(config.databaseUrl, {
    poolMax: config.dbPoolMax,
    txTimeoutMs: config.dbTxTimeoutMs,
  });
  const tenantScope: ITenantScope = new TenantScopeRunner(db);
  // Built in dal together with its own client (ADR 0010), so this file never holds the provisioner connection.
  const provisioning = createProvisioningQuery(config.provisioningDatabaseUrl, {
    poolMax: config.dbPoolMax,
    txTimeoutMs: config.dbTxTimeoutMs,
  });
  const managers: Managers = {
    health: new HealthManager(new HealthQuery(db), new SystemClock(), config.version),
    auth: new AuthManager(
      new AuthQuery(db),
      new Argon2PasswordHasher(),
      new SystemClock(),
      new SessionTokens(),
      config.sessionLifetimes ?? DEFAULT_SESSION_LIFETIMES,
    ),
    organization: new OrganizationManager(new OrganizationQuery(), provisioning, config.roleSource),
    product: new ProductManager(new ProductQuery()),
    inventory: new InventoryManager(new InventoryQuery()),
    accounting: new AccountingManager(new AccountingQuery()),
    vehicle: new VehicleManager(new VehicleQuery()),
    report: new ReportManager(new ReportQuery()),
    party: new PartyManager(new PartyQuery()),
    sales: new SalesManager(new SalesQuery()),
    purchase: new PurchaseManager(new PurchaseQuery()),
    service: new ServiceManager(new ServiceQuery()),
    crm: new CrmManager(new CrmQuery()),
  };
  return {
    managers,
    provided: { numberSeries: new NumberSeries(new NumberSeriesQuery()) },
    tenantScope,
    close: async () => void (await Promise.all([db.$disconnect(), provisioning.close()])),
  };
}
