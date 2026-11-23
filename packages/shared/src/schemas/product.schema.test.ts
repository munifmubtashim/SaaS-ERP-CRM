import { describe, expect, it } from 'vitest';
import {
  productListItemSchema,
  productListQuerySchema,
  productListResponseSchema,
} from './product.schema.js';

// Synthetic sample only.
const item = {
  id: '0196f000-0000-7000-8000-000000000201',
  code: 'P-0001',
  name: 'Sample Product 150',
  brand: 'Sample Brand',
  unit: 'pcs',
  tracking: 'serial',
  status: 'active',
};

describe('productListItemSchema', () => {
  it('accepts a product row; brand may be null', () => {
    expect(productListItemSchema.parse(item)).toEqual(item);
    expect(productListItemSchema.safeParse({ ...item, brand: null }).success).toBe(true);
  });

  it('tracks a product by serial number or by quantity only', () => {
    expect(productListItemSchema.safeParse({ ...item, tracking: 'quantity' }).success).toBe(true);
    expect(productListItemSchema.safeParse({ ...item, tracking: 'batch' }).success).toBe(false);
  });

  it('is active or archived, never deleted', () => {
    expect(productListItemSchema.safeParse({ ...item, status: 'archived' }).success).toBe(true);
    expect(productListItemSchema.safeParse({ ...item, status: 'deleted' }).success).toBe(false);
  });

  it('drops cost and any other unknown key, so a hidden field cannot leak through the list', () => {
    expect(productListItemSchema.parse({ ...item, cost: '98000.00', margin: '12.00' })).toEqual(item);
  });

  it('keeps vehicle-pack fields out of the core row', () => {
    expect(productListItemSchema.parse({ ...item, engineCc: 150, modelYear: 2026 })).toEqual(item);
  });

  it('requires a code and a name of sensible length', () => {
    for (const bad of [{ code: '' }, { code: 'x'.repeat(33) }, { name: '' }, { name: 'x'.repeat(201) }]) {
      expect(
        productListItemSchema.safeParse({ ...item, ...bad }).success,
        JSON.stringify(bad).slice(0, 30),
      ).toBe(false);
    }
  });
});

describe('productListQuerySchema', () => {
  it('trims the search and treats a blank one as no search', () => {
    expect(productListQuerySchema.parse({ search: '  sample ' }).search).toBe('sample');
    expect(productListQuerySchema.parse({ search: '   ' }).search).toBeUndefined();
  });

  it('filters by status and pages with the shared defaults', () => {
    expect(productListQuerySchema.parse({ status: 'archived' })).toEqual({ status: 'archived', limit: 25 });
    expect(productListQuerySchema.safeParse({ status: 'gone' }).success).toBe(false);
  });
});

describe('productListResponseSchema', () => {
  it('is a cursor page of product rows', () => {
    expect(productListResponseSchema.safeParse({ items: [item], nextCursor: null }).success).toBe(true);
  });
});
