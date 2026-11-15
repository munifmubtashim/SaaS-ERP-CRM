import { Router } from 'express';
import type { InventoryController } from '../controllers/InventoryController.js';
import type { ModuleRoutes } from './types.js';

/**
 * Inventory module, routes. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function inventoryRoutes(_controller: InventoryController): ModuleRoutes {
  const router = Router();
  // TODO(Munif): router.get('/', _controller.list) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Inventory', basePath: '/v1/inventory', scope: 'tenant', router };
}
