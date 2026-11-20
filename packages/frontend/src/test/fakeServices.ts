import type { HealthResponse } from '@erp/shared';
import type { IHealthService, IProductService, Services } from '../services';

/** Fake IHealthService: returns a fixed answer or fails, with no network. */
export class FakeHealthService implements IHealthService {
  constructor(private readonly answer: HealthResponse | Error) {}
  async get(): Promise<HealthResponse> {
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

/** IProductService for tests that never list products: using it is a test bug, so it fails loudly. */
export const unusedProduct: IProductService = {
  list: () => Promise.reject(new Error('This test listed products without injecting a service.')),
};

/** Services made of fakes; pass overrides for the ones a test drives. Stub modules have empty contracts. */
export function fakeServices(health: IHealthService, overrides: Partial<Services> = {}): Services {
  return {
    health,
    auth: {},
    organization: {},
    product: unusedProduct,
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
