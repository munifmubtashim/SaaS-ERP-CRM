import type { VehicleQuery } from '@erp/dal';

/**
 * Vehicle module, business rules. No Express, no SQL: call VehicleQuery. Owner: Munif.
 * TODO(Munif): vehicle pack: units, reservations, registration; pack only (roadmap 5.9, spec O-11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class VehicleManager {
  constructor(readonly query: VehicleQuery) {}
}
