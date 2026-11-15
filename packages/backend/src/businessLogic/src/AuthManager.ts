import type { IAuthQuery } from './contracts/IAuthQuery.js';

/**
 * Auth module: business rules. No Express, no SQL. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class AuthManager {
  constructor(protected readonly query: IAuthQuery) {}
}
