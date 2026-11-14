import type { DbClient } from '../config/db.js';

/**
 * Accounting module, database access (dal). SQL and Prisma calls live only here. Owner: Munif.
 * TODO(Munif): accounts, journals, periods, banking (roadmap 4.3, 5.8).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class AccountingQuery {
  constructor(readonly db: DbClient) {}
}
