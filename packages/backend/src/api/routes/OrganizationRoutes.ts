import { Router } from 'express';
import type { OrganizationController } from '../controllers/OrganizationController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Organization module, routes. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function organizationRoutes(_controller: OrganizationController, _wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  // TODO(Munif): router.get('/', _wrap.tenant((req) => _controller.list(req))) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Organization', basePath: '/v1/organizations', scope: 'tenant', router };
}
