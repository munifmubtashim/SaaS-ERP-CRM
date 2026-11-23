import { HealthService, type IHealthService } from './healthService';
import { HttpClient, type IHttpClient } from './HttpClient';
import { AuthService, type IAuthService } from './authService';
import { OrganizationService, type IOrganizationService } from './organizationService';
import { ProductService, type IProductService } from './productService';
import { InventoryService, type IInventoryService } from './inventoryService';
import { AccountingService, type IAccountingService } from './accountingService';
import { VehicleService, type IVehicleService } from './vehicleService';
import { ReportService, type IReportService } from './reportService';
import { PartyService, type IPartyService } from './partyService';
import { SalesService, type ISalesService } from './salesService';
import { PurchaseService, type IPurchaseService } from './purchaseService';
import { ServiceService, type IServiceService } from './serviceService';
import { CrmService, type ICrmService } from './crmService';
import { MockCrmService } from './mock/MockCrmService';

export { ApiRequestError, HttpClient, type IHttpClient } from './HttpClient';
export type { IHealthService } from './healthService';
export type { ICrmService } from './crmService';

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

export interface CreateServicesOptions {
  /**
   * Use the mock services for routes that don't exist yet. On by default only in a development build
   * (`vite dev`), so a deployed app never shows invented data.
   */
  useMocks?: boolean;
}

/** Frontend composition root: the ONLY place services are constructed (lint-enforced). */
export function createServices(
  http: IHttpClient = new HttpClient(),
  { useMocks = import.meta.env.DEV }: CreateServicesOptions = {},
): Services {
  return {
    health: new HealthService(http),
    auth: new AuthService(http),
    organization: new OrganizationService(http),
    product: new ProductService(http),
    inventory: new InventoryService(http),
    accounting: new AccountingService(http),
    vehicle: new VehicleService(http),
    report: new ReportService(http),
    party: new PartyService(http),
    sales: new SalesService(http),
    purchase: new PurchaseService(http),
    service: new ServiceService(http),
    // Mock in development until GET /v1/follow-ups exists; a production build calls the API.
    crm: useMocks ? new MockCrmService() : new CrmService(http),
  };
}
