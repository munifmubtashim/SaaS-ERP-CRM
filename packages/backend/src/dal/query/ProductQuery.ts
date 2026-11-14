import type { DbClient } from '../config/db.js';

/**
 * Product module, database access (dal). SQL and Prisma calls live only here. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ProductQuery {
  constructor(readonly db: DbClient) {}
}
