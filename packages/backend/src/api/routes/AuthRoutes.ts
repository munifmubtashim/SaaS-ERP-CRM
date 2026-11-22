import { Router } from 'express';
import type { AuthController } from '../controllers/AuthController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Auth module, routes. Owner: Munif. Public: no tenant data, and login runs before any session (ADR 0018).
 * Every route here is on PUBLIC_ROUTES.
 */
export function authRoutes(controller: AuthController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.post(
    '/login',
    wrap.public((req) => controller.login(req)),
  );
  router.post(
    '/logout',
    wrap.public((req) => controller.logout(req)),
  );
  return { module: 'Auth', basePath: '/v1/auth', scope: 'public', router };
}
