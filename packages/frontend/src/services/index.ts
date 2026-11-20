import { HealthService, type IHealthService } from './healthService';
import { HttpClient, type IHttpClient } from './HttpClient';
import { AuthService, type IAuthService } from './authService';
import { OrganizationService, type IOrganizationService } from './organizationService';
import { ProductService, type IProductService } from './productService';
import { InventoryService, type IInventoryService } from './inventoryService';
import { AccountingService, type IAccountingService } from './accountingService';
import { VehicleService, type IVehicleService } from './vehicleService';
import { ReportService, type IReportService } from './reportService';
import type { IPartyService } from './partyService';
import { MockPartyService } from './mock/MockPartyService';
import { activeBusinessStore } from '../store/activeBusinessStore';
import type { ISalesService } from './salesService';
import { MockSalesService } from './mock/MockSalesService';
import { PurchaseService, type IPurchaseService } from './purchaseService';
import { ServiceService, type IServiceService } from './serviceService';
import { CrmService, type ICrmService } from './crmService';

export { ApiRequestError, HttpClient, type IHttpClient } from './HttpClient';
export type { IHealthService } from './healthService';
export type { IPartyService } from './partyService';
export type { ISalesService } from './salesService';

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
    product: new ProductService(http),
    inventory: new InventoryService(http),
    accounting: new AccountingService(http),
    vehicle: new VehicleService(http),
    report: new ReportService(http),
    // Mock until GET /v1/parties exists (F2); then new PartyService(http).
    party: new MockPartyService(() => activeBusinessStore.get()),
    // Mock until the dues route exists (A15); then new SalesService(http).
    sales: new MockSalesService(() => activeBusinessStore.get()),
    purchase: new PurchaseService(http),
    service: new ServiceService(http),
    crm: new CrmService(http),
  };
}
