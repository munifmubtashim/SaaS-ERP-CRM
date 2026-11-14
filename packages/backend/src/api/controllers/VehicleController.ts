import type { VehicleManager } from '@erp/business-logic';

/**
 * Vehicle module, HTTP controller. Parse input, call VehicleManager, send the response. Owner: Munif.
 * TODO(Munif): vehicle pack: units, reservations, registration; pack only (roadmap 5.9, spec O-11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class VehicleController {
  constructor(readonly manager: VehicleManager) {}
}
