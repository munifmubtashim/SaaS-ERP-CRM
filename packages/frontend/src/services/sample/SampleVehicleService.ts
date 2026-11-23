import { todayBD, type VehicleUnit } from '@erp/shared';
import type { IVehicleService } from '../vehicleService';
import { sampleUnits } from './sampleUnits';

/**
 * The Vehicle pack's sample behind IVehicleService: development builds only (VITE_DEMO_DATA=vehicle). `today` fixes
 * the day for tests; left out, days in stock count to today in Dhaka.
 */
export class SampleVehicleService implements IVehicleService {
  constructor(
    private readonly delayMs = 300,
    private readonly today: string | null = null,
  ) {}

  private later<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), this.delayMs));
  }

  private all() {
    return sampleUnits(this.today ?? todayBD(new Date().toISOString()));
  }

  units = () =>
    this.later(
      this.all().map(
        ({ invoiceNumber: _i, advance: _a, registrationDone: _r, ...unit }): VehicleUnit => unit,
      ),
    );

  unit = (chassisNo: string) => {
    const found = this.all().find((u) => u.chassisNo === chassisNo);
    return found ? this.later(found) : Promise.reject(new Error('vehicle.unit_not_found'));
  };
}
