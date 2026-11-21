import { Router } from 'express';
import type { CrmController } from '../controllers/CrmController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Crm module, routes. Owner: Farhan.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function crmRoutes(_controller: CrmController, _wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  // TODO(Farhan): router.get('/', _wrap.tenant((req) => _controller.list(req))) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Crm', basePath: '/v1/crm', scope: 'tenant', router };
}
