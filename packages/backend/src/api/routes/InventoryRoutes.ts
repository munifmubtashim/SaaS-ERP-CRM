import { Router } from 'express';
import type { InventoryController } from '../controllers/InventoryController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Inventory module, routes. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function inventoryRoutes(_controller: InventoryController, _wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  // TODO(Munif): router.get('/', _wrap.tenant((req) => _controller.list(req))) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Inventory', basePath: '/v1/inventory', scope: 'tenant', router };
}
