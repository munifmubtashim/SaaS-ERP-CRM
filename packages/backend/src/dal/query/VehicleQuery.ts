import type { DbClient } from '../config/db.js';

/**
 * Vehicle module, database access (dal). SQL and Prisma calls live only here. Owner: Munif.
 * TODO(Munif): vehicle pack: units, reservations, registration; pack only (roadmap 5.9, spec O-11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class VehicleQuery {
  constructor(readonly db: DbClient) {}
}
