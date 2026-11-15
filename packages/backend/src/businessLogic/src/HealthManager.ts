import type { HealthResponse } from '@erp/shared';
import type { IClock } from './contracts/IClock.js';
import type { IHealthQuery } from './contracts/IHealthQuery.js';

/**
 * Reference Manager: business rules only, no Express, no SQL. Dependencies arrive through the
 * constructor as interfaces; the composition root (index.ts) decides which classes fill them.
 */
export class HealthManager {
  constructor(
    private readonly query: IHealthQuery,
    private readonly clock: IClock,
    private readonly version: string,
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const { databaseOk } = await this.query.ping();
    return {
      status: databaseOk ? 'ok' : 'degraded',
      version: this.version,
      time: this.clock.now().toISOString(),
      checks: { database: databaseOk ? 'ok' : 'down' },
    };
  }
}
