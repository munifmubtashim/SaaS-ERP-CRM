import type { DbClient } from '../config/db.js';

/**
 * Report module, database access (dal). SQL and Prisma calls live only here. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ReportQuery {
  constructor(readonly db: DbClient) {}
}
