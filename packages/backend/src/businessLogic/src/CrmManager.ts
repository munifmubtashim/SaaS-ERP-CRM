import type { CrmQuery } from '@erp/dal';

/**
 * Crm module, business rules. No Express, no SQL: call CrmQuery. Owner: Farhan.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class CrmManager {
  constructor(readonly query: CrmQuery) {}
}
