import type { DbClient } from '../config/db.js';

/**
 * Service module, database access (dal). SQL and Prisma calls live only here. Owner: Farhan.
 * TODO(Farhan): workshop job cards, warranty (roadmap 5.10).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ServiceQuery {
  constructor(readonly db: DbClient) {}
}
