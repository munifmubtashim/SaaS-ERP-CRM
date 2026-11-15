import type { IHttpClient } from './HttpClient';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- TODO(Munif): add one small method per use case (interface segregation)
export interface IVehicleService {}

/**
 * Vehicle module: frontend API calls, one method per endpoint. Owner: Munif.
 * TODO(Munif): vehicle pack: units, reservations, registration; pack only (roadmap 5.9, spec O-11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class VehicleService implements IVehicleService {
  constructor(protected readonly http: IHttpClient) {}
}
