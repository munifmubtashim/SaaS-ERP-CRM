import { BaseController } from './BaseController.js';
import type { IVehicleManager } from './contracts/IVehicleManager.js';

/**
 * Vehicle module: HTTP controller. HTTP in and out only. Owner: Munif.
 * TODO(Munif): vehicle pack: units, reservations, registration; pack only (roadmap 5.9, spec O-11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class VehicleController extends BaseController {
  constructor(protected readonly manager: IVehicleManager) {
    super();
  }
}
