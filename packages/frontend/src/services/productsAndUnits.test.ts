import { productModelSummarySchema, vehicleUnitDetailSchema, vehicleUnitSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IHttpClient, IHttpPatch } from './HttpClient';
import { ProductService } from './productService';
import { SampleProductService } from './sample/SampleProductService';
import { SampleVehicleService } from './sample/SampleVehicleService';
import { VehicleService } from './vehicleService';

/** The Products screen's reads: models (core) and units (Vehicle pack only, spec O-11). */
class RecordingHttp implements IHttpClient, IHttpPatch {
  gets: string[] = [];
  getJson = (path: string) => {
    this.gets.push(path);
    return Promise.reject(new Error('no API in this test'));
  };
  postJson = () => Promise.reject(new Error('unused'));
  post = () => Promise.reject(new Error('unused'));
  patchJson = () => Promise.reject(new Error('unused'));
}

describe('ProductService and VehicleService (the API)', () => {
  it('read models, units and one unit on provisional paths', async () => {
    const http = new RecordingHttp();
    await new ProductService(http).models().catch(() => undefined);
    const vehicle = new VehicleService(http);
    await vehicle.units().catch(() => undefined);
    await vehicle.unit('VL3 000101').catch(() => undefined);
    expect(http.gets).toEqual(['/v1/products/models', '/v1/vehicle/units', '/v1/vehicle/units/VL3%20000101']);
  });
});

describe('the samples', () => {
  it('models: invented, in the shared shape, their counts matching the sample units', async () => {
    const models = await new SampleProductService(0).models();
    const units = await new SampleVehicleService(0, '2026-11-12').units();
    expect(models.length).toBeGreaterThanOrEqual(3);
    for (const model of models) {
      expect(productModelSummarySchema.parse(model)).toEqual(model);
      expect(model.inStock).toBe(
        units.filter((u) => u.model === model.name && u.status === 'in_stock').length,
      );
      expect(model.reserved).toBe(
        units.filter((u) => u.model === model.name && u.status === 'reserved').length,
      );
    }
  });

  it('units: invented, in the shared shape, every status present, days in stock counted to the given day', async () => {
    const units = await new SampleVehicleService(0, '2026-11-12').units();
    for (const u of units) expect(vehicleUnitSchema.parse(u)).toEqual(u);
    expect(new Set(units.map((u) => u.status))).toEqual(
      new Set(['in_stock', 'reserved', 'sold', 'delivered']),
    );
    const waiting = units.find((u) => u.status === 'in_stock');
    const days = Math.round((Date.parse('2026-11-12') - Date.parse(waiting?.receivedOn ?? '')) / 86_400_000);
    expect(waiting?.daysInStock).toBe(days);
    expect(
      units.filter((u) => u.status === 'sold' || u.status === 'delivered').every((u) => u.daysInStock === 0),
    ).toBe(true);
  });

  it('a unit opens with its invoice, advance and registration steps', async () => {
    const service = new SampleVehicleService(0, '2026-11-12');
    const units = await service.units();
    const reserved = units.find((u) => u.status === 'reserved');
    const detail = await service.unit(reserved?.chassisNo ?? '');
    expect(vehicleUnitDetailSchema.parse(detail)).toEqual(detail);
    expect(detail.advance).not.toBeNull();
    const delivered = await service.unit(units.find((u) => u.status === 'delivered')?.chassisNo ?? '');
    expect(delivered.invoiceNumber).not.toBeNull();
    expect(delivered.registrationDone.length).toBeGreaterThan(0);
    await expect(service.unit('nothing')).rejects.toThrow('vehicle.unit_not_found');
  });
});
