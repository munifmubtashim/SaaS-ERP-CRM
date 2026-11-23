import { Router } from 'express';
import type { HealthController } from '../controllers/HealthController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/** Reference Routes file: builds a router and binds controller methods through the wrappers. Nothing else. */
export function healthRoutes(controller: HealthController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.get(
    '/',
    wrap.public(() => controller.get()),
  );
  return { module: 'Health', basePath: '/health', scope: 'public', router };
}
