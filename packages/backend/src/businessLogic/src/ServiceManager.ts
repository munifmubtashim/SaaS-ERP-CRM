import type { ServiceQuery } from '@erp/dal';

/**
 * Service module, business rules. No Express, no SQL: call ServiceQuery. Owner: Farhan.
 * TODO(Farhan): workshop job cards, warranty (roadmap 5.10).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ServiceManager {
  constructor(readonly query: ServiceQuery) {}
}
