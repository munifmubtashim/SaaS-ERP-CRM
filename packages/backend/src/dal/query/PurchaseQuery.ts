import type { DbClient } from '../config/db.js';

/**
 * Purchase module, database access (dal). SQL and Prisma calls live only here. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class PurchaseQuery {
  constructor(readonly db: DbClient) {}
}
