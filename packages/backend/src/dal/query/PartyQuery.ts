import type { DbClient } from '../config/db.js';

/**
 * Party module, database access (dal). SQL and Prisma calls live only here. Owner: Farhan.
 * TODO(Farhan): customers, suppliers, contacts, dues (roadmap 5.3).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class PartyQuery {
  constructor(readonly db: DbClient) {}
}
