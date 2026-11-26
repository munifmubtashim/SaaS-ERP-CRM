import { HealthService, type IHealthService } from './healthService';
import { HttpClient, type IHttpClient } from './HttpClient';
import { AuthService, type IAuthService } from './authService';
import { OrganizationService, type IOrganizationService } from './organizationService';
import { MockOrganizationService } from './mock/MockOrganizationService';
import { ProductService, type IProductService } from './productService';
import { InventoryService, type IInventoryService } from './inventoryService';
import { AccountingService, type IAccountingService } from './accountingService';
import { VehicleService, type IVehicleService } from './vehicleService';
import { ReportService, ReportServiceSwitch, type IReportService } from './reportService';
import { SampleInventoryService } from './sample/SampleInventoryService';
import { SampleProductService } from './sample/SampleProductService';
import { SampleReportService } from './sample/SampleReportService';
import { PartyService, type IPartyService } from './partyService';
import { SalesService, SalesServiceSwitch, type ISalesService } from './salesService';
import { PartyService, PartyServiceSwitch, type IPartyService } from './partyService';
import { SalesPaymentService, type ISalesPaymentService } from './salesPaymentService';
import { SalesService, type ISalesService } from './salesService';
import { SampleSalesService } from './sample/SampleSalesService';
import { SamplePartyService } from './sample/SamplePartyService';
import { MockPartyService } from './mock/MockPartyService';
import { MockSalesService } from './mock/MockSalesService';
import { activeBusinessStore } from '../store/activeBusinessStore';
import { activeScopeStore } from '../store/activeScopeStore';
import { SampleSalesPaymentService } from './sample/SampleSalesPaymentService';
import { SampleVehicleService } from './sample/SampleVehicleService';
import { PurchaseService, type IPurchaseService } from './purchaseService';
import { ServiceService, type IServiceService } from './serviceService';
import { CrmService, type ICrmService } from './crmService';
import { parseDemoData, type DemoService } from './demoData';

export { ApiRequestError, HttpClient, type IHttpClient } from './HttpClient';
export type { IHealthService } from './healthService';
export type { IAuthService } from './authService';
export type { IOrganizationService } from './organizationService';
export type { DemoService } from './demoData';
export type { IReportService, ReportCall } from './reportService';
export type { ISalesService, PaymentDraft } from './salesService';
export type { ISalesPaymentService } from './salesPaymentService';
export type { IPartyService, PartyCall } from './partyService';
export type { IInventoryService } from './inventoryService';
export type { IProductService } from './productService';
export type { IVehicleService } from './vehicleService';

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
  salesPayments: ISalesPaymentService;
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

export interface CreateServicesOptions {
  /**
   * Use the mock services for routes that don't exist yet. On by default only in a development build
   * (`vite dev`), so a deployed app never shows invented data.
   */
  useMocks?: boolean;
}

/** Frontend composition root: the ONLY place services are constructed (lint-enforced). */
export function createServices(
  // The tab's active business and branch travel on every call (ADR 0007).
  http: IHttpClient = new HttpClient('/api', () => activeScopeStore.get()),
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
    // Sample until the catalogue routes exist (#105, ADR 0052); a production build always calls the API.
    product: demo.has('product') ? new SampleProductService() : new ProductService(http),
    // Sample until the stock routes exist (ADR 0021, 0054); a production build always calls the API.
    inventory: demo.has('inventory') ? new SampleInventoryService() : new InventoryService(http),
    accounting: new AccountingService(http),
    // The Vehicle pack: sample until the unit routes exist (#107). With the sample on, the pack counts as on.
    vehicle: demo.has('vehicle') ? new SampleVehicleService() : new VehicleService(http),
    // Each report call is real or sample on its own key (report.<call>).
    report: new ReportServiceSwitch(new ReportService(http), new SampleReportService(), (call) =>
      demo.has(`report.${call}`),
    ),
    // The customer routes exist (#209, #216): real unless `party` is named. Dues wait for F5 (`party.dues`).
    party: new PartyServiceSwitch(
      new PartyService(http),
      new SamplePartyService(
        new MockPartyService(() => activeBusinessStore.get()),
        new MockSalesService(() => activeBusinessStore.get()),
      ),
      (call) => demo.has(call === 'dues' ? 'party.dues' : 'party'),
    ),
    // Sample until the POS routes exist (ADR 0022); a production build always calls the API.
    // The POS (sales.pos) and the invoices view (sales.invoices) are real or sample on their own keys.
    sales: new SalesServiceSwitch(new SalesService(http), new SampleSalesService(), (call) =>
      demo.has(call === 'posItems' || call === 'completeSale' ? 'sales.pos' : 'sales.invoices'),
    ),
    sales: demo.has('sales') ? new SampleSalesService() : new SalesService(http),
    // POST /v1/payments exists (ADR 0057); sample by default until invoice reads exist (demoData.ts).
    salesPayments: demo.has('sales.payments')
      ? new SampleSalesPaymentService()
      : new SalesPaymentService(http),
    purchase: new PurchaseService(http),
    service: new ServiceService(http),
    crm: new CrmService(http),
    demo,
  };
}
