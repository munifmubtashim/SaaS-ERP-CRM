import type { DbClient } from '../config/db.js';
import type { HealthDTO } from '../dto/HealthDTO.js';

/** Example Query: the only layer that talks to the database. Pattern to copy for every module. */
export class HealthQuery {
  constructor(private readonly db: DbClient) {}

  /** Runs SELECT 1. Never throws: a failure is reported as databaseOk = false. */
  async ping(): Promise<HealthDTO> {
    const started = performance.now();
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { databaseOk: true, latencyMs: Math.round(performance.now() - started) };
    } catch {
      return { databaseOk: false, latencyMs: Math.round(performance.now() - started) };
    }
  }
}
