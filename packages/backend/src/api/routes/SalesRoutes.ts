import { Router } from 'express';
import type { SalesController } from '../controllers/SalesController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Sales module, routes. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function salesRoutes(_controller: SalesController, _wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  // TODO(Farhan): router.get('/', _wrap.tenant((req) => _controller.list(req))) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Sales', basePath: '/v1/sales', scope: 'tenant', router };
}
