import { Router } from 'express';
import type { VehicleController } from '../controllers/VehicleController.js';
import type { RouteWrappers } from './tenantRoute.js';
import type { ModuleRoutes } from './types.js';

/**
 * Vehicle module, routes. Owner: Munif.
 * TODO(Munif): vehicle pack: units, reservations, registration; pack only (roadmap 5.9, spec O-11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function vehicleRoutes(_controller: VehicleController, _wrap: RouteWrappers): ModuleRoutes {
  const router = Router();
  // TODO(Munif): router.get('/', _wrap.tenant((req) => _controller.list(req))) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Vehicle', basePath: '/v1/vehicles', scope: 'tenant', router };
}
