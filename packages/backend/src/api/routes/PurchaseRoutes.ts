import { Router } from 'express';
import type { PurchaseController } from '../controllers/PurchaseController.js';
import type { ModuleRoutes } from './types.js';

/**
 * Purchase module, routes. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function purchaseRoutes(_controller: PurchaseController): ModuleRoutes {
  const router = Router();
  // TODO(Farhan): router.get('/', _controller.list) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Purchase', basePath: '/v1/purchases', scope: 'tenant', router };
}
