import type { DbClient } from '../config/db.js';

/**
 * Sales module, database access (dal). SQL and Prisma calls live only here. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class SalesQuery {
  constructor(readonly db: DbClient) {}
}
