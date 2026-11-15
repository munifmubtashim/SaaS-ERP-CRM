import type { HealthResponse } from '@erp/shared';
import type { IHealthService, Services } from '../services';

/** Fake IHealthService: returns a fixed answer or fails, with no network. */
export class FakeHealthService implements IHealthService {
  constructor(private readonly answer: HealthResponse | Error) {}
  async get(): Promise<HealthResponse> {
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

/** Services made of fakes. Stub modules have empty contracts, so `{}` satisfies them. */
export function fakeServices(health: IHealthService): Services {
  return {
    health,
    auth: {},
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
  };
}
