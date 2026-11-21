import { Router } from 'express';
import type { ReportController } from '../controllers/ReportController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Report module, routes. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function reportRoutes(_controller: ReportController, _wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  // TODO(Munif): router.get('/', _wrap.tenant((req) => _controller.list(req))) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Report', basePath: '/v1/reports', scope: 'tenant', router };
}
