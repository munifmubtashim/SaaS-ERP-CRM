import { Router } from 'express';
import type { HealthController } from '../controllers/HealthController.js';
import type { ModuleRoutes } from './types.js';

/** Example Routes file: paths and middleware only, then hand over to the Controller. */
export function healthRoutes(controller: HealthController): ModuleRoutes {
  const router = Router();
  router.get('/', controller.get);
  return { module: 'Health', basePath: '/health', scope: 'public', router };
}
