import { Router } from 'express';
import type { HealthController } from '../controllers/HealthController.js';
import type { ModuleRoutes } from './types.js';

/** Reference Routes file: builds a router and binds controller methods. Nothing else. */
export function healthRoutes(controller: HealthController): ModuleRoutes {
  const router = Router();
  router.get('/', controller.get.bind(controller));
  router.get('/live', controller.live.bind(controller));
  return { module: 'Health', basePath: '/health', scope: 'public', router };
}
