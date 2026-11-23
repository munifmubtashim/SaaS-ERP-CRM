import { describe, expect, it } from 'vitest';
import { reservationDraftSchema, vehicleUnitDetailSchema, vehicleUnitSchema } from './vehicle.schema.js';

// Synthetic sample only. Provisional view shapes for the Vehicle pack's units on the Products screen.
const unit = {
  chassisNo: 'VL3-000101',
  engineNo: 'E3V-550101',
  model: 'Velo 150 V3',
  colour: 'Racing blue',
  branchName: 'Branch One',
  status: 'in_stock',
  receivedOn: '2026-11-02',
  daysInStock: 11,
  customerName: null,
};

describe('Vehicle unit view shapes (provisional)', () => {
  it('a unit: in stock, reserved, sold (not delivered) or delivered; never a cost', () => {
    expect(vehicleUnitSchema.parse(unit)).toEqual(unit);
    expect(vehicleUnitSchema.safeParse({ ...unit, status: 'registered' }).success).toBe(false);
    expect(Object.keys(vehicleUnitSchema.shape).some((key) => key.toLowerCase().includes('cost'))).toBe(
      false,
    );
  });

  it('details add the invoice, the advance and which BRTA steps are done', () => {
    const detail = {
      ...unit,
      status: 'sold',
      invoiceNumber: 'INV-261113-014',
      advance: null,
      registrationDone: ['papers_sent', 'fee_paid'],
    };
    expect(vehicleUnitDetailSchema.parse(detail)).toEqual(detail);
    expect(vehicleUnitDetailSchema.safeParse({ ...detail, registrationDone: ['approved'] }).success).toBe(
      false,
    );
  });

  it('a reservation names the customer and a positive advance as a money string', () => {
    const draft = { chassisNo: 'VL3-000101', customerName: 'Sample Customer', advance: '20000.00' };
    expect(reservationDraftSchema.parse(draft)).toEqual(draft);
    for (const bad of [
      { ...draft, customerName: '' },
      { ...draft, advance: '0.00' },
      { ...draft, advance: 20000 },
    ]) {
      expect(reservationDraftSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
