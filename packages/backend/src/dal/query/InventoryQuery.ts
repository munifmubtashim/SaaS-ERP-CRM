import type { DbClient } from '../config/db.js';

/**
 * Inventory module, database access (dal). SQL and Prisma calls live only here. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class InventoryQuery {
  constructor(readonly db: DbClient) {}
}
