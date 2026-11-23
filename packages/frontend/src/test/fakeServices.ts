import type { HealthResponse } from '@erp/shared';
import type {
  IAuthService,
  IHealthService,
  IOrganizationService,
  IReportService,
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
};

/** Services made of fakes; pass overrides for the ones a test drives. Stub modules have empty contracts. */
export function fakeServices(health: IHealthService, overrides: Partial<Services> = {}): Services {
  return {
    health,
    auth: unusedAuth,
    organization: unusedOrganization,
    product: {},
    inventory: {},
    accounting: {},
    vehicle: {},
    report: unusedReport,
    party: {},
    sales: {},
    purchase: {},
    service: {},
    crm: {},
    demo: new Set(),
    ...overrides,
  };
}
