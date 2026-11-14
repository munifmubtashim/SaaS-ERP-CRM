import type { OrganizationQuery } from '@erp/dal';

/**
 * Organization module, business rules. No Express, no SQL: call OrganizationQuery. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class OrganizationManager {
  constructor(readonly query: OrganizationQuery) {}
}
