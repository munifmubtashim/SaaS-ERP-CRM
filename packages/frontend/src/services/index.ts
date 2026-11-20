import { HealthService, type IHealthService } from './healthService';
import { HttpClient, type IHttpClient } from './HttpClient';
import { AuthService, type IAuthService } from './authService';
import { OrganizationService, type IOrganizationService } from './organizationService';
import type { IProductService } from './productService';
import { MockProductService } from './mock/MockProductService';
import type { IInventoryService } from './inventoryService';
import { MockInventoryService } from './mock/MockInventoryService';
import { AccountingService, type IAccountingService } from './accountingService';
import { VehicleService, type IVehicleService } from './vehicleService';
import { ReportService, type IReportService } from './reportService';
import { PartyService, type IPartyService } from './partyService';
import { SalesService, type ISalesService } from './salesService';
import { PurchaseService, type IPurchaseService } from './purchaseService';
import { ServiceService, type IServiceService } from './serviceService';
import { CrmService, type ICrmService } from './crmService';

export { ApiRequestError, HttpClient, type IHttpClient } from './HttpClient';
export type { IHealthService } from './healthService';
export type { IProductService } from './productService';
export type { IInventoryService } from './inventoryService';

/** Every API service, as interfaces. Components reach them through useServices(), never `new`. */
export interface Services {
  health: IHealthService;
  auth: IAuthService;
  organization: IOrganizationService;
  product: IProductService;
  inventory: IInventoryService;
  accounting: IAccountingService;
  vehicle: IVehicleService;
  report: IReportService;
  party: IPartyService;
  sales: ISalesService;
  purchase: IPurchaseService;
  service: IServiceService;
  crm: ICrmService;
}

/** Frontend composition root: the ONLY place services are constructed (lint-enforced). */
export function createServices(http: IHttpClient = new HttpClient()): Services {
  return {
    health: new HealthService(http),
    auth: new AuthService(http),
    organization: new OrganizationService(http),
    // Mock until GET /v1/products exists (catalogue tables not yet planned); then new ProductService(http).
    product: new MockProductService(),
    // Mock until GET /v1/stock exists (stock tables not yet planned); then new InventoryService(http).
    inventory: new MockInventoryService(),
    accounting: new AccountingService(http),
    vehicle: new VehicleService(http),
    report: new ReportService(http),
    party: new PartyService(http),
    sales: new SalesService(http),
    purchase: new PurchaseService(http),
    service: new ServiceService(http),
    crm: new CrmService(http),
  };
}
