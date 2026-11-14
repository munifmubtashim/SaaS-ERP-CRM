import type { DbClient } from '../config/db.js';

/**
 * Organization module, database access (dal). SQL and Prisma calls live only here. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class OrganizationQuery {
  constructor(readonly db: DbClient) {}
}
