import type { IHealthManager } from './IHealthManager.js';
import type { IAuthManager } from './IAuthManager.js';
import type { IOrganizationManager } from './IOrganizationManager.js';
import type { IProductManager } from './IProductManager.js';
import type { IInventoryManager } from './IInventoryManager.js';
import type { IAccountingManager } from './IAccountingManager.js';
import type { IVehicleManager } from './IVehicleManager.js';
import type { IReportManager } from './IReportManager.js';
import type { IPartyManager } from './IPartyManager.js';
import type { ISalesManager } from './ISalesManager.js';
import type { IPurchaseManager } from './IPurchaseManager.js';
import type { IServiceManager } from './IServiceManager.js';
import type { ICrmManager } from './ICrmManager.js';

export type { IHealthManager } from './IHealthManager.js';
export type { IAuthManager } from './IAuthManager.js';
export type { IOrganizationManager } from './IOrganizationManager.js';
export type { IProductManager } from './IProductManager.js';
export type { IInventoryManager } from './IInventoryManager.js';
export type { IAccountingManager } from './IAccountingManager.js';
export type { IVehicleManager } from './IVehicleManager.js';
export type { IReportManager } from './IReportManager.js';
export type { IPartyManager } from './IPartyManager.js';
export type { ISalesManager } from './ISalesManager.js';
export type { IPurchaseManager } from './IPurchaseManager.js';
export type { IServiceManager } from './IServiceManager.js';
export type { ICrmManager } from './ICrmManager.js';

/**
 * What the api layer needs from businessLogic, as interfaces it owns. server.ts passes the result of
 * createManagers() here, so TypeScript checks that every Manager satisfies its contract.
 */
export interface ApiManagers {
  health: IHealthManager;
  auth: IAuthManager;
  organization: IOrganizationManager;
  product: IProductManager;
  inventory: IInventoryManager;
  accounting: IAccountingManager;
  vehicle: IVehicleManager;
  report: IReportManager;
  party: IPartyManager;
  sales: ISalesManager;
  purchase: IPurchaseManager;
  service: IServiceManager;
  crm: ICrmManager;
}
