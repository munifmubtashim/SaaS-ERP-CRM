import type { AuthManager } from '@erp/business-logic';

/**
 * Auth module, HTTP controller. Parse input, call AuthManager, send the response. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class AuthController {
  constructor(readonly manager: AuthManager) {}
}
