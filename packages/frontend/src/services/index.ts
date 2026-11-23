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
import { parseDemoData, type DemoService } from './demoData';

export { ApiRequestError, HttpClient, type IHttpClient } from './HttpClient';
export type { IHealthService } from './healthService';
export type { IAuthService } from './authService';
export type { IOrganizationService } from './organizationService';
export type { DemoService } from './demoData';

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
  /** The services answering with sample data, so their screens show the Demo data badge. */
  demo: ReadonlySet<DemoService>;
}

export interface CreateServicesOptions {
  /** Services that use their sample implementation; default: VITE_DEMO_DATA (never any in a production build). */
  demo?: ReadonlySet<DemoService>;
}

/** Frontend composition root: the ONLY place services are constructed (lint-enforced). */
export function createServices(
  http: IHttpClient = new HttpClient(),
  {
    demo = parseDemoData(import.meta.env.VITE_DEMO_DATA, { production: import.meta.env.PROD }),
  }: CreateServicesOptions = {},
): Services {
  return {
    health: new HealthService(http),
    // The login routes exist (ADR 0018): the real service in every build.
    auth: new AuthService(http),
    // Sample until GET /v1/me/businesses exists (M2); a production build always calls the API.
    organization: demo.has('organization') ? new MockOrganizationService() : new OrganizationService(http),
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
    demo,
  };
}
