import type { HealthResponse } from '@erp/shared';
import type {
  IAuthService,
  IHealthService,
  IInventoryService,
  IPartyService,
  IProductService,
  IVehicleService,
  IOrganizationService,
  IReportService,
  ISalesPaymentService,
  ISalesService,
  Services,
} from '../services';

/** Fake IHealthService: returns a fixed answer or fails, with no network. */
export class FakeHealthService implements IHealthService {
  constructor(private readonly answer: HealthResponse | Error) {}
  async get(): Promise<HealthResponse> {
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

/** IAuthService for tests that never sign in: using it is a test bug, so it fails loudly. */
export const unusedAuth: IAuthService = {
  login: () => Promise.reject(new Error('This test signed in without injecting an IAuthService.')),
  logout: () => Promise.resolve(),
};

/** IOrganizationService for tests that never load businesses: using it is a test bug, so it fails loudly. */
export const unusedOrganization: IOrganizationService = {
  myBusinesses: () => Promise.reject(new Error('This test loaded businesses without injecting a service.')),
};

const noReport = () => Promise.reject(new Error('This test loaded a report without injecting a service.'));

/** IReportService for tests that never load reports: using it is a test bug, so it fails loudly. */
export const unusedReport: IReportService = {
  ownerDashboard: noReport,
  salesToday: noReport,
  stockValue: noReport,
  customerDues: noReport,
  supplierDues: noReport,
  salesTarget: noReport,
  vatReturn: noReport,
  cashPosition: noReport,
  monthlyResults: noReport,
  bankFeed: noReport,
  branchResults: noReport,
  customerInsights: noReport,
  needsAction: noReport,
  dayCloseStatus: noReport,
  unitStock: noReport,
  kpiTrends: noReport,
  cashForecast: noReport,
};

/** ISalesService for tests that never sell: using it is a test bug, so it fails loudly. */
export const unusedSales: ISalesService = {
  posItems: () => Promise.reject(new Error('This test loaded POS items without injecting a service.')),
  completeSale: () => Promise.reject(new Error('This test completed a sale without injecting a service.')),
  invoices: () => Promise.reject(new Error('This test listed invoices without injecting a service.')),
  invoice: () => Promise.reject(new Error('This test opened an invoice without injecting a service.')),
  recordPayment: () => Promise.reject(new Error('This test recorded a payment without injecting a service.')),
};

/** IInventoryService for tests that never read stock: using it is a test bug, so it fails loudly. */
export const unusedInventory: IInventoryService = {
  stockItems: () => Promise.reject(new Error('This test listed stock without injecting a service.')),
  stockItem: () => Promise.reject(new Error('This test opened a stock item without injecting a service.')),
  movements: () => Promise.reject(new Error('This test listed movements without injecting a service.')),
};

/** IProductService and IVehicleService for tests that never read them: using one is a test bug. */
export const unusedProduct: IProductService = {
  models: () => Promise.reject(new Error('This test listed models without injecting a service.')),
};
export const unusedVehicle: IVehicleService = {
  units: () => Promise.reject(new Error('This test listed units without injecting a service.')),
  unit: () => Promise.reject(new Error('This test opened a unit without injecting a service.')),
};

export const unusedSalesPayments: ISalesPaymentService = {
  recordPayment: () => Promise.reject(new Error('This test recorded a payment without injecting a service.')),
};

/** A party service a test did not expect to be called: using it fails loudly. */
const unusedParty: IPartyService = {
  list: () => Promise.reject(new Error('This test did not expect a party request.')),
  get: () => Promise.reject(new Error('This test did not expect a party request.')),
  dues: () => Promise.reject(new Error('This test did not expect a party request.')),
  create: () => Promise.reject(new Error('This test did not expect a party request.')),
  update: () => Promise.reject(new Error('This test did not expect a party request.')),
};

/** Services made of fakes; pass overrides for the ones a test drives. Stub modules have empty contracts. */
export function fakeServices(health: IHealthService, overrides: Partial<Services> = {}): Services {
  return {
    health,
    auth: unusedAuth,
    organization: unusedOrganization,
    product: unusedProduct,
    inventory: unusedInventory,
    accounting: {},
    vehicle: unusedVehicle,
    report: unusedReport,
    party: unusedParty,
    sales: unusedSales,
    salesPayments: unusedSalesPayments,
    purchase: {},
    service: {},
    crm: {},
    demo: new Set(),
    ...overrides,
  };
}
