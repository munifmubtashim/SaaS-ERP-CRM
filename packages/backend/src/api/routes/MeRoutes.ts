import { Router } from 'express';
import type { AuthController } from '../controllers/AuthController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * The signed-in user's own routes (ADR 0007 section 2, ADR 0060). Owner: Munif. Scope 'user': authMiddleware runs
 * (mounted on all of /v1), tenantMiddleware does not, so no X-Business-Id is needed or read. Read-only.
 */
export function meRoutes(controller: AuthController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.get(
    '/businesses',
    wrap.user((req) => controller.myBusinesses(req)),
  );
  return { module: 'Me', basePath: '/v1/me', scope: 'user', router };
}
