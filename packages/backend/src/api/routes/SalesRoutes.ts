import { Router } from 'express';
import type { SalesController } from '../controllers/SalesController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Sales module, routes. Owner: Farhan. A tenant router: tenantMiddleware (X-Business-Id, X-Branch-Id) runs first.
 * POST /v1/invoices (ADR 0022 section 2; item 3b): a money and stock route, so it is idempotent (ADR 0011) and
 * checked by permission sales.invoice.post (Owner, Branch Manager, Cashier). No GET yet. POST /v1/payments has its
 * own router below (ADR 0057).
 */
export function salesRoutes(controller: SalesController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.post(
    '/',
    wrap.tenant((req) => controller.postInvoice(req), { permission: 'sales.invoice.post', idempotent: true }),
  );
  return { module: 'Sales', basePath: '/v1/invoices', scope: 'tenant', router };
}

/**
 * POST /v1/payments (ADR 0057): a money route, so idempotent (ADR 0011) and checked by permission
 * sales.payment.create (all five roles, ADR 0026 section 4). The reads and the void come with F4.
 */
export function salesPaymentRoutes(controller: SalesController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.post(
    '/',
    wrap.tenant((req) => controller.recordPayment(req), {
      permission: 'sales.payment.create',
      idempotent: true,
    }),
  );
  return { module: 'Sales', basePath: '/v1/payments', scope: 'tenant', router };
}
