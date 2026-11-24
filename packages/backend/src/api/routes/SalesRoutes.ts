import { Router } from 'express';
import type { SalesController } from '../controllers/SalesController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Sales module, routes. Owner: Farhan. A tenant router: tenantMiddleware (X-Business-Id, X-Branch-Id) runs first.
 * POST /v1/invoices (ADR 0022 section 2; item 3b): a money and stock route, so it is idempotent (ADR 0011) and
 * checked by permission sales.invoice.post (Owner, Branch Manager, Cashier). No GET yet. POST /v1/payments (ADR 0026,
 * Farhan's F3) mounts its own router under its own base path.
 */
export function salesRoutes(controller: SalesController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.post(
    '/',
    wrap.tenant((req) => controller.postInvoice(req), { permission: 'sales.invoice.post', idempotent: true }),
  );
  return { module: 'Sales', basePath: '/v1/invoices', scope: 'tenant', router };
}
