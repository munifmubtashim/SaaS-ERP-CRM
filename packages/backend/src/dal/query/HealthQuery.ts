import { HealthDTO } from '../dto/HealthDTO.js';
import { BaseQuery } from './BaseQuery.js';

/** Reference Query: database access only, returns a DTO. Satisfies businessLogic's IHealthQuery. */
export class HealthQuery extends BaseQuery {
  /** Runs SELECT 1. Never throws: a failure is reported as databaseOk = false. */
  async ping(): Promise<HealthDTO> {
    const started = performance.now();
    try {
      await this.db.$queryRaw`SELECT 1`;
      return HealthDTO.fromProbe(true, performance.now() - started);
    } catch {
      return HealthDTO.fromProbe(false, performance.now() - started);
    }
  }
}
