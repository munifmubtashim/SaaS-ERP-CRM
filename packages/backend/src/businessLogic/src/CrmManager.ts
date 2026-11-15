import type { ICrmQuery } from './contracts/ICrmQuery.js';

/**
 * Crm module: business rules. No Express, no SQL. Owner: Farhan.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class CrmManager {
  constructor(protected readonly query: ICrmQuery) {}
}
