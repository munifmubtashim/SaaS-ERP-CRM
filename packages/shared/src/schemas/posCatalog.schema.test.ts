import { describe, expect, it } from 'vitest';
import { posCatalogSchema } from './inventory.schema.js';

/**
 * GET /v1/stock/pos-catalog (Munif, 24 Nov): stock on hand at the request's branch, per product, with the serial units in stock
 * and the business's walk-in party, for the POS. Quantities and money are strings; no cost.
 */
const item = {
  productId: '0196f000-0000-7000-8000-0000000000f0',
  code: 'PRT-BRK-0214',
  name: 'Brake pad set, front, 150 cc',
  unit: 'pcs',
  tracking: 'quantity',
  sellPrice: '1000.00',
  isPassThrough: false,
  onHand: '12.000',
  units: [],
};
const bike = {
  ...item,
  productId: '0196f000-0000-7000-8000-0000000000f2',
  code: 'VL3-150',
  name: 'Velo 150 V3',
  tracking: 'serial',
  sellPrice: '185000.00',
  onHand: '2.000',
  units: [
    { id: '0196f000-0000-7000-8000-0000000000a1', serialNo: 'VL3-000101' },
    { id: '0196f000-0000-7000-8000-0000000000a2', serialNo: 'VL3-000102' },
  ],
};
const list = { walkInPartyId: '0196f000-0000-7000-8000-0000000000c0', items: [item, bike] };

describe('posCatalogSchema', () => {
  it('accepts parts by quantity and bikes with their units in stock', () => {
    expect(posCatalogSchema.safeParse(list).success).toBe(true);
  });

  it('allows no walk-in party yet (null) and an empty list', () => {
    expect(posCatalogSchema.safeParse({ walkInPartyId: null, items: [] }).success).toBe(true);
  });

  it.each([
    ['a quantity as a number', { onHand: 12 }],
    ['a price as a number', { sellPrice: 1000 }],
    ['an unknown tracking', { tracking: 'batch' }],
    ['a cost on the item (hidden, plan 2.5)', { avgCost: '700.00' }],
  ])('refuses %s', (_case, change) => {
    expect(posCatalogSchema.safeParse({ ...list, items: [{ ...item, ...change }] }).success).toBe(false);
  });
});
