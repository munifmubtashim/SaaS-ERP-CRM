import { Router } from 'express';
import type { PurchaseController } from '../controllers/PurchaseController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Purchase module, routes. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function purchaseRoutes(_controller: PurchaseController, _wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  // TODO(Farhan): router.get('/', _wrap.tenant((req) => _controller.list(req))) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Purchase', basePath: '/v1/purchases', scope: 'tenant', router };
}
