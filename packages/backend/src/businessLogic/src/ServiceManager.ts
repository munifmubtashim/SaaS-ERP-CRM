import type { IServiceQuery } from './contracts/IServiceQuery.js';

/**
 * Service module: business rules. No Express, no SQL. Owner: Farhan.
 * TODO(Farhan): workshop job cards, warranty (roadmap 5.10).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ServiceManager {
  constructor(protected readonly query: IServiceQuery) {}
}
