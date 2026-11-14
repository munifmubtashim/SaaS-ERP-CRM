import type { HealthQuery } from '@erp/dal';
import type { HealthResponse } from '@erp/shared';

/**
 * Example Manager: business rules for the health check, no Express and no SQL.
 * It calls HealthQuery (dal) and returns the shared HealthResponse type. Pattern to copy.
 */
export class HealthManager {
  constructor(
    private readonly query: Pick<HealthQuery, 'ping'>,
    private readonly version: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const { databaseOk } = await this.query.ping();
    return {
      status: databaseOk ? 'ok' : 'degraded',
      version: this.version,
      time: this.now().toISOString(),
      checks: { database: databaseOk ? 'ok' : 'down' },
    };
  }
}
