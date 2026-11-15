import type { IVehicleQuery } from './contracts/IVehicleQuery.js';

/**
 * Vehicle module: business rules. No Express, no SQL. Owner: Munif.
 * TODO(Munif): vehicle pack: units, reservations, registration; pack only (roadmap 5.9, spec O-11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class VehicleManager {
  constructor(protected readonly query: IVehicleQuery) {}
}
