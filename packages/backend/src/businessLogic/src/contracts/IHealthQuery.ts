import type { HealthDTO } from '@erp/dal';

/** What HealthManager needs from the database. Owned here (the consumer); dal's HealthQuery satisfies it. */
export interface IHealthQuery {
  ping(): Promise<HealthDTO>;
}
