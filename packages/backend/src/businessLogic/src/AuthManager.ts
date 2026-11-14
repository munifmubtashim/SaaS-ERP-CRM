import type { AuthQuery } from '@erp/dal';

/**
 * Auth module, business rules. No Express, no SQL: call AuthQuery. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class AuthManager {
  constructor(readonly query: AuthQuery) {}
}
