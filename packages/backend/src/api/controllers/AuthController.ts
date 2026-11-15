import { BaseController } from './BaseController.js';
import type { IAuthManager } from './contracts/IAuthManager.js';

/**
 * Auth module: HTTP controller. HTTP in and out only. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class AuthController extends BaseController {
  constructor(protected readonly manager: IAuthManager) {
    super();
  }
}
