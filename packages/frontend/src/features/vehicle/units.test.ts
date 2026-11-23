import type { VehicleUnit } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { filterUnits, unitSummary } from './units';

/** The Products screen's Units list (design/owner-dashboard/Bikes.dc.html): filter, search and summary. */
const unit = (chassisNo: string, status: VehicleUnit['status'], daysInStock: number): VehicleUnit => ({
  chassisNo,
  engineNo: `E-${chassisNo}`,
  model: chassisNo.startsWith('VL') ? 'Velo 150 V3' : 'Ridge 125 S',
  colour: 'Racing blue',
  branchName: 'Mirpur-10',
  status,
  receivedOn: '2026-08-01',
  daysInStock,
  customerName: status === 'in_stock' ? null : 'Sample Customer',
});

const UNITS = [
  unit('VL3-000101', 'in_stock', 12),
  unit('VL3-000102', 'in_stock', 104),
  unit('RG1-000201', 'reserved', 95),
  unit('RG1-000202', 'sold', 0),
  unit('RG1-000203', 'delivered', 0),
];

describe('filterUnits', () => {
  it('each status filter shows its units; Not delivered means sold but not handed over', () => {
    expect(filterUnits(UNITS, '', 'all')).toHaveLength(5);
    expect(filterUnits(UNITS, '', 'in_stock').map((u) => u.chassisNo)).toEqual(['VL3-000101', 'VL3-000102']);
    expect(filterUnits(UNITS, '', 'reserved').map((u) => u.chassisNo)).toEqual(['RG1-000201']);
    expect(filterUnits(UNITS, '', 'sold').map((u) => u.chassisNo)).toEqual(['RG1-000202']);
  });

  it('90+ days: units still waiting to be sold (in stock or reserved) for 90 days or more', () => {
    expect(filterUnits(UNITS, '', 'old').map((u) => u.chassisNo)).toEqual(['VL3-000102', 'RG1-000201']);
  });

  it('searches the chassis number, engine number or model, any case', () => {
    expect(filterUnits(UNITS, 'vl3-000102', 'all').map((u) => u.chassisNo)).toEqual(['VL3-000102']);
    expect(filterUnits(UNITS, 'e-rg1-000203', 'all').map((u) => u.chassisNo)).toEqual(['RG1-000203']);
    expect(filterUnits(UNITS, 'ridge', 'in_stock')).toEqual([]);
  });
});

describe('unitSummary', () => {
  it('available to sell, reserved, sold but not delivered, and how many available units are 90+ days old', () => {
    expect(unitSummary(UNITS)).toEqual({ available: 2, reserved: 1, notDelivered: 1, availableOld: 1 });
  });
});
