import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/AuthController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Auth module, routes. Owner: Munif. Public: no tenant data, and login runs before any session (ADR 0018).
 * Every route here is on PUBLIC_ROUTES.
 */
export function authRoutes(
  controller: AuthController,
  wrap: RouteWrappers,
  /** The per-IP login limit (ADR 0018 section 4, step 7), before the handler. */
  loginLimit: RequestHandler,
): ModuleRoutes {
  const router = Router();
  router.post(
    '/login',
    loginLimit,
    wrap.public((req) => controller.login(req)),
  );
  router.post(
    '/logout',
    wrap.public((req) => controller.logout(req)),
  );
  return { module: 'Auth', basePath: '/v1/auth', scope: 'public', router };
}
