import { HealthService, type IHealthService } from './healthService';
import { HttpClient, type IHttpClient } from './HttpClient';
import { AuthService, type IAuthService } from './authService';
import { OrganizationService, type IOrganizationService } from './organizationService';
import { MockOrganizationService } from './mock/MockOrganizationService';
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

export { ApiRequestError, HttpClient, type IHttpClient } from './HttpClient';
export type { IHealthService } from './healthService';
export type { IAuthService } from './authService';
export type { IOrganizationService } from './organizationService';

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
   * Use mocks for routes that don't exist yet. On only in a development build (`vite dev`), so a deployed app
   * never shows invented data.
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
    // The login routes exist (ADR 0018): the real service in every build.
    auth: new AuthService(http),
    // Mock in development until GET /v1/me/businesses exists (M2); a production build calls the API.
    organization: useMocks ? new MockOrganizationService() : new OrganizationService(http),
    product: new ProductService(http),
    inventory: new InventoryService(http),
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
