import { describe, expect, it } from 'vitest';
import * as productSchemas from './product.schema.js';
import {
  productCreateSchema,
  productDetailSchema,
  productEditSchema,
  productListItemSchema,
  productListQuerySchema,
  productListResponseSchema,
  productModelSummarySchema,
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

describe('ADR 0052 test 1: create and edit bodies', () => {
  const create = {
    code: 'HLM-01',
    name: 'Helmet',
    unit: 'pcs',
    tracking: 'quantity',
    sellPrice: '2500.50',
  };

  it('accepts a create with money as a two-decimal string; optional fields default to null', () => {
    expect(productCreateSchema.parse(create)).toEqual({
      ...create,
      nameBn: null,
      brand: null,
      category: null,
    });
  });

  it('refuses a number, a one-decimal string or a negative amount for sellPrice', () => {
    for (const sellPrice of [2500.5, '12.5', '-1.00']) {
      expect(productCreateSchema.safeParse({ ...create, sellPrice }).success, String(sellPrice)).toBe(false);
    }
  });

  it('refuses unknown keys on create, such as businessId (ADR 0052 test 8)', () => {
    expect(productCreateSchema.safeParse({ ...create, businessId: item.id }).success).toBe(false);
  });

  it('an edit carries the version it read and at least one change; code, tracking and businessId are refused', () => {
    expect(productEditSchema.parse({ version: 3, name: 'Helmet XL' })).toEqual({
      version: 3,
      name: 'Helmet XL',
    });
    for (const bad of [
      { version: 3 },
      { name: 'x' },
      { version: 3, code: 'NEW' },
      { version: 3, tracking: 'serial' },
      { version: 3, businessId: item.id },
      { version: 0, name: 'x' },
    ]) {
      expect(productEditSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('ADR 0052 test 2 / ADR 0020 test 10: no product response carries a cost', () => {
  it('no key of any product schema mentions cost', () => {
    const keysOf = (schema: unknown): string[] => {
      const shape = (schema as { shape?: Record<string, unknown> }).shape;
      return shape ? Object.keys(shape) : [];
    };
    const keys = Object.values(productSchemas).flatMap(keysOf);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => key.toLowerCase().includes('cost'))).toEqual([]);
    expect(keysOf(productDetailSchema)).toEqual(
      expect.arrayContaining(['sellPrice', 'version', 'nameBn', 'category']),
    );
  });
});

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
