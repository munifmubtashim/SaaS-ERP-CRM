import { Router } from 'express';
import type { ReportController } from '../controllers/ReportController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Report module, routes. Owner: Munif. A tenant router: tenantMiddleware (X-Business-Id, X-Branch-Id) runs first.
 * GET /v1/reports/owner-dashboard (ADR 0023 section 2): Owner, and Business Manager for their own businesses (D-03);
 * the transaction runs READ ONLY, so any write in it fails (ADR 0005 Q2).
 */
export function reportRoutes(controller: ReportController, wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  router.get(
    '/owner-dashboard',
    wrap.tenant((req) => controller.ownerDashboard(req), {
      roles: ['owner', 'business_manager'],
      readOnly: true,
    }),
  );
  return { module: 'Report', basePath: '/v1/reports', scope: 'tenant', router };
}
