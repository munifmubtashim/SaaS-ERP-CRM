import type { z } from 'zod';
import type { vehicleSchema } from '../schemas/vehicle.schema.js';

/**
 * Vehicle module, types. Owner: Munif.
 * TODO(Munif): vehicle pack: units, reservations, registration; pack only (roadmap 5.9, spec O-11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Vehicle = z.infer<typeof vehicleSchema>;
