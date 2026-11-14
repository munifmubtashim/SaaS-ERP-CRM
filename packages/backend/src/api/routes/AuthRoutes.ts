import { Router } from 'express';
import type { AuthController } from '../controllers/AuthController.js';
import type { ModuleRoutes } from './types.js';

/**
 * Auth module, routes. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function authRoutes(_controller: AuthController): ModuleRoutes {
  const router = Router();
  // TODO(Munif): router.get('/', _controller.list) ... Public routes must also be added to PUBLIC_ROUTES.
  return { module: 'Auth', basePath: '/v1/auth', scope: 'public', router };
}
