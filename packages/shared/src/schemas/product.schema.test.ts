import { describe, expect, it } from 'vitest';
import { productModelSummarySchema } from './product.schema.js';

// Synthetic sample only. Provisional view shape for the Models tab of the Products screen.
describe('product model summary (provisional)', () => {
  it('a model: price as a money string and counts by unit status', () => {
    const model = {
      id: 'velo-150',
      name: 'Velo 150 V3',
      businessName: 'Sample Motors',
      price: '245000.00',
      inStock: 3,
      reserved: 1,
      soldThisMonth: 4,
    };
    expect(productModelSummarySchema.parse(model)).toEqual(model);
    expect(productModelSummarySchema.safeParse({ ...model, price: 245000 }).success).toBe(false);
    expect(productModelSummarySchema.safeParse({ ...model, inStock: -1 }).success).toBe(false);
  });
});
