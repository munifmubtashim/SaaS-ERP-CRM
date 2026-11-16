import type { HealthResponse } from '@erp/shared';
import type { IHealthService, IReportService, Services } from '../services';

/** Fake IHealthService: returns a fixed answer or fails, with no network. */
export class FakeHealthService implements IHealthService {
  constructor(private readonly answer: HealthResponse | Error) {}
  async get(): Promise<HealthResponse> {
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

/** IReportService for tests that never load reports: using it is a test bug, so it fails loudly. */
export const unusedReport: IReportService = {
  ownerDashboard: () => Promise.reject(new Error('This test loaded a report without injecting a service.')),
};

/** Services made of fakes; pass overrides for the ones a test drives. Stub modules have empty contracts. */
export function fakeServices(health: IHealthService, overrides: Partial<Services> = {}): Services {
  return {
    health,
    auth: {},
    organization: {},
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
    ...overrides,
  };
}
