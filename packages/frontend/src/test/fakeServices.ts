import type { HealthResponse } from '@erp/shared';
import type { IAuthService, IHealthService, Services } from '../services';

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

/** Services made of fakes; pass overrides for the ones a test drives. Stub modules have empty contracts. */
export function fakeServices(health: IHealthService, overrides: Partial<Services> = {}): Services {
  return {
    health,
    auth: unusedAuth,
    organization: {},
    product: {},
    inventory: {},
    accounting: {},
    vehicle: {},
    report: {},
    party: {},
    sales: {},
    purchase: {},
    service: {},
    crm: {},
    ...overrides,
  };
}
