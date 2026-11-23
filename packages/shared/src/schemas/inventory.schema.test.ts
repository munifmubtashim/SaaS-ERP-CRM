import { describe, expect, it } from 'vitest';
import {
  stockAdjustmentDraftSchema,
  stockItemDetailSchema,
  stockItemSchema,
  stockMovementSchema,
  transferSchema,
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
