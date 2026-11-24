import { describe, expect, it } from 'vitest';
import {
  stockAdjustmentDraftSchema,
  stockItemDetailSchema,
  stockItemSchema,
  stockMovementSchema,
  transferSchema,
  stockListQuerySchema,
  stockListResponseSchema,
  stockRowSchema,
} from './inventory.schema.js';

// Synthetic sample only. Provisional view shapes for the Inventory screen: per branch, never per location.
const item = {
  id: 'oil-1l',
  name: 'Engine oil 4T, 1 litre',
  sku: 'PRT-OIL-0101',
  category: 'Parts',
  onHand: '64',
  reserved: '6',
  reorderLevel: '40',
  status: 'in_stock',
};

describe('Inventory view shapes (provisional)', () => {
  it('a stock row: quantities as decimal strings, status in stock, low or out; cost only when allowed', () => {
    expect(stockItemSchema.parse(item)).toEqual(item);
    expect(stockItemSchema.parse({ ...item, valueAtCost: '49920.00' })).toMatchObject({
      valueAtCost: '49920.00',
    });
    expect(stockItemSchema.safeParse({ ...item, onHand: 64 }).success).toBe(false);
    expect(stockItemSchema.safeParse({ ...item, status: 'negative' }).success).toBe(false);
  });

  it('item details list on-hand by branch', () => {
    const detail = { ...item, byBranch: [{ branchId: 'b-1', branchName: 'Branch One', onHand: '64' }] };
    expect(stockItemDetailSchema.parse(detail)).toEqual(detail);
  });

  it('a movement has a signed quantity and one of the five types', () => {
    const move = {
      id: 'mv-1',
      at: '2026-11-12T04:00:00.000Z',
      itemName: 'Engine oil 4T, 1 litre',
      branchName: 'Branch One',
      type: 'transfer_out',
      quantityDelta: '-10',
      reference: 'TR-2611-007',
      by: 'Store keeper',
    };
    expect(stockMovementSchema.parse(move)).toEqual(move);
    expect(stockMovementSchema.safeParse({ ...move, type: 'write_off' }).success).toBe(false);
  });

  it('a transfer is in transit or received; an adjustment adds or removes a positive quantity with a reason', () => {
    const transfer = {
      number: 'TR-2611-007',
      createdAt: '2026-11-12T04:00:00.000Z',
      itemName: 'Brake pad set',
      quantity: '10',
      fromBranch: 'Branch One',
      toBranch: 'Branch Two',
      status: 'in_transit',
    };
    expect(transferSchema.parse(transfer)).toEqual(transfer);
    const adjustment = {
      itemId: 'oil-1l',
      branchId: 'b-1',
      direction: 'remove',
      quantity: '2',
      reason: 'Damaged',
    };
    expect(stockAdjustmentDraftSchema.parse(adjustment)).toEqual(adjustment);
    for (const bad of [
      { ...adjustment, quantity: '0' },
      { ...adjustment, quantity: '-2' },
      { ...adjustment, reason: '' },
    ]) {
      expect(stockAdjustmentDraftSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

// Synthetic sample only.
const row = {
  productId: '0196f000-0000-7000-8000-000000000201',
  productCode: 'P-0001',
  productName: 'Sample Product 150',
  branchId: '0196f000-0000-7000-8000-0000000000a2',
  branchName: 'Demo Branch North',
  onHand: '12.000',
};

describe('stockRowSchema', () => {
  it('accepts one product in one branch with its on-hand quantity as a three-decimal string', () => {
    expect(stockRowSchema.parse(row)).toEqual(row);
  });

  it('refuses a quantity sent as a number or with the wrong decimals', () => {
    expect(stockRowSchema.safeParse({ ...row, onHand: 12 }).success).toBe(false);
    expect(stockRowSchema.safeParse({ ...row, onHand: '12' }).success).toBe(false);
  });

  it('refuses negative stock: on hand is never below zero (spec F-08)', () => {
    expect(stockRowSchema.safeParse({ ...row, onHand: '-1.000' }).success).toBe(false);
  });

  it('drops cost and stock value, which are hidden fields', () => {
    expect(stockRowSchema.parse({ ...row, unitCost: '98000.00', value: '1176000.00' })).toEqual(row);
  });
});

describe('stockListQuerySchema', () => {
  it('filters by one branch (a UUID) and searches by product', () => {
    const branchId = row.branchId;
    expect(stockListQuerySchema.parse({ branchId, search: ' 150 ' })).toEqual({
      branchId,
      search: '150',
      limit: 25,
    });
    expect(stockListQuerySchema.safeParse({ branchId: 'north' }).success).toBe(false);
  });
});

describe('stockListResponseSchema', () => {
  it('is a cursor page of stock rows', () => {
    expect(stockListResponseSchema.safeParse({ items: [row], nextCursor: 'next' }).success).toBe(true);
  });
});
