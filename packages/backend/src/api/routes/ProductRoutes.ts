import { Router } from 'express';
import type { ProductController } from '../controllers/ProductController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/** Every role may view products (Munif, 23 Nov). */
const VIEW = { roles: ['owner', 'business_manager', 'branch_manager', 'accountant', 'cashier'] } as const;
/** Create, edit and archive: the system Owner and Business Manager only. */
const MANAGE = { roles: ['owner', 'business_manager'] } as const;

/**
 * Product module, routes (ADR 0052 section 1). Owner: Munif. A tenant router: tenantMiddleware (X-Business-Id,
 * X-Branch-Id) runs first; each route declares its roles. No delete: a product is archived. Not idempotent: no money
 * or stock moves; a repeated create is refused by the code, a repeated edit by the version.
 */
export function productRoutes(controller: ProductController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.get(
    '/',
    wrap.tenant((req) => controller.list(req), VIEW),
  );
  router.get(
    '/:id',
    wrap.tenant((req) => controller.get(req), VIEW),
  );
  router.post(
    '/',
    wrap.tenant((req) => controller.create(req), MANAGE),
  );
  router.patch(
    '/:id',
    wrap.tenant((req) => controller.edit(req), MANAGE),
  );
  return { module: 'Product', basePath: '/v1/products', scope: 'tenant', router };
}
