import { describe, expect, it } from 'vitest';
import { stockListQuerySchema, stockListResponseSchema, stockRowSchema } from './inventory.schema.js';

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
