import { Router } from 'express';
import type { PartyController } from '../controllers/PartyController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Party module, routes (ADR 0056 section 4): the customer routes of release 1. Owner: Farhan. A tenant router:
 * tenantMiddleware (X-Business-Id, X-Branch-Id) runs first; each route declares its permission code (ADR 0006
 * section 8). No delete: a party is deactivated. Not idempotent yet (ADR 0019 question 5): no money or stock moves.
 */
export function partyRoutes(controller: PartyController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.get(
    '/',
    wrap.tenant((req) => controller.list(req), { permission: 'party.customer.view' }),
  );
  router.get(
    '/:id',
    wrap.tenant((req) => controller.get(req), { permission: 'party.customer.view' }),
  );
  router.get(
    '/:id/dues',
    wrap.tenant((req) => controller.dues(req), { permission: 'party.customer.view' }),
  );
  router.post(
    '/',
    wrap.tenant((req) => controller.create(req), { permission: 'party.customer.create' }),
  );
  router.patch(
    '/:id',
    wrap.tenant((req) => controller.edit(req), { permission: 'party.customer.edit' }),
  );
  router.post(
    '/:id/deactivate',
    wrap.tenant((req) => controller.deactivate(req), { permission: 'party.customer.deactivate' }),
  );
  return { module: 'Party', basePath: '/v1/parties', scope: 'tenant', router };
}
