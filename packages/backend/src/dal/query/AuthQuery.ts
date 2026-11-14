import type { DbClient } from '../config/db.js';

/**
 * Auth module, database access (dal). SQL and Prisma calls live only here. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class AuthQuery {
  constructor(readonly db: DbClient) {}
}
