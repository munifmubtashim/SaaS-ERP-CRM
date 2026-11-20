import type { HealthResponse } from '@erp/shared';
import type { IHealthService, IPartyService, Services } from '../services';

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
    sales: {},
    purchase: {},
    service: {},
    crm: {},
    ...overrides,
  };
}
