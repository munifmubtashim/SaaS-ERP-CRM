import type { IOrganizationQuery } from './contracts/IOrganizationQuery.js';

/**
 * Organization module: business rules. No Express, no SQL. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class OrganizationManager {
  constructor(protected readonly query: IOrganizationQuery) {}
}
