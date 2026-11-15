import type { HealthResponse } from '@erp/shared';

/** What HealthController needs. Owned here (the consumer); businessLogic's HealthManager satisfies it. */
export interface IHealthManager {
  getHealth(): Promise<HealthResponse>;
}
