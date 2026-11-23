import {
  vehicleUnitDetailSchema,
  vehicleUnitSchema,
  type VehicleUnit,
  type VehicleUnitDetail,
} from '@erp/shared';
import { z } from 'zod';
import type { IHttpClient } from './HttpClient';

/**
 * What the Products screen reads from the Vehicle pack (design/owner-dashboard/Bikes.dc.html, Units). Owner: Munif.
 * Pack only (spec O-11). Provisional, like the shapes it uses (#135); reserving and registration come later (5b).
 */
export interface IVehicleService {
  /** Every unit with its status, branch and days in stock. */
  units(): Promise<VehicleUnit[]>;
  /** One unit with its invoice, booking advance and registration steps. */
  unit(chassisNo: string): Promise<VehicleUnitDetail>;
}

/** Vehicle pack: the API. The paths are provisional; the routes don't exist yet (#107). */
export class VehicleService implements IVehicleService {
  constructor(protected readonly http: IHttpClient) {}
  units = () => this.http.getJson('/v1/vehicle/units', z.array(vehicleUnitSchema));
  unit = (chassisNo: string) =>
    this.http.getJson(`/v1/vehicle/units/${encodeURIComponent(chassisNo)}`, vehicleUnitDetailSchema);
}
