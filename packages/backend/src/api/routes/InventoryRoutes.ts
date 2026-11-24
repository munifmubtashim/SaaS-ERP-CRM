import { Router } from 'express';
import type { InventoryController } from '../controllers/InventoryController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/** Every role reads stock (as products: Munif, 23 Nov). Neither read carries a cost. */
const VIEW = {
  roles: ['owner', 'business_manager', 'branch_manager', 'accountant', 'cashier'],
  readOnly: true,
} as const;

/**
 * Inventory module, routes. Owner: Munif. A tenant router: tenantMiddleware (X-Business-Id, X-Branch-Id) runs first.
 * GET /v1/stock (#34's shape, the inventory page) and GET /v1/stock/pos-catalog (#198, the POS); both read-only.
 */
export function inventoryRoutes(controller: InventoryController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.get(
    '/',
    wrap.tenant((req) => controller.list(req), VIEW),
  );
  router.get(
    '/pos-catalog',
    wrap.tenant((req) => controller.posCatalog(req), VIEW),
  );
  return { module: 'Inventory', basePath: '/v1/stock', scope: 'tenant', router };
}
