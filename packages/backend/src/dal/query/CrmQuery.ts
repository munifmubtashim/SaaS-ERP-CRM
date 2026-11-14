import type { DbClient } from '../config/db.js';

/**
 * Crm module, database access (dal). SQL and Prisma calls live only here. Owner: Farhan.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class CrmQuery {
  constructor(readonly db: DbClient) {}
}
