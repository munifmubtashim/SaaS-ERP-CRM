import type { HealthResponse } from '@erp/shared';
import type { IHealthService, IPartyService, ISalesService, Services } from '../services';

/** Fake IHealthService: returns a fixed answer or fails, with no network. */
export class FakeHealthService implements IHealthService {
  constructor(private readonly answer: HealthResponse | Error) {}
  async get(): Promise<HealthResponse> {
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

/** A party service a test did not expect to be called: using it fails loudly. */
const unusedParty: IPartyService = {
  list: () => Promise.reject(new Error('This test did not expect a party request.')),
  get: () => Promise.reject(new Error('This test did not expect a party request.')),
};

/** A sales service a test did not expect to be called: using it fails loudly. */
const unusedSales: ISalesService = {
  dues: () => Promise.reject(new Error('This test did not expect a sales request.')),
};

/** Services made of fakes. Stub modules have empty contracts, so `{}` satisfies them. Override per test. */
export function fakeServices(health: IHealthService, overrides: Partial<Services> = {}): Services {
  return {
    health,
    auth: {},
    organization: {},
    product: {},
    inventory: {},
    accounting: {},
    vehicle: {},
    report: {},
    party: unusedParty,
    sales: unusedSales,
    purchase: {},
    service: {},
    crm: {},
    ...overrides,
  };
}
