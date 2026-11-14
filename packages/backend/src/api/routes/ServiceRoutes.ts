import { Router } from 'express';
import type { ServiceController } from '../controllers/ServiceController.js';
import type { ModuleRoutes } from './types.js';

/**
 * Service module, routes. Owner: Farhan.
 * TODO(Farhan): workshop job cards, warranty (roadmap 5.10).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function serviceRoutes(_controller: ServiceController): ModuleRoutes {
  const router = Router();
  // TODO(Farhan): router.get('/', _controller.list) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Service', basePath: '/v1/service', scope: 'tenant', router };
}
