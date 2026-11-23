import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IProductQuery, ProductRecord } from './contracts/IProductQuery.js';
import { ProductManager } from './ProductManager.js';

/** ADR 0052 test 3 and the Manager's mapping, over a fake Query (the real one is ProductQuery.int.test.ts, #124). */
const ID = '0196f000-0000-7000-8000-000000000301';
const USER = '0196f000-0000-7000-8000-0000000000b1';

const record = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
  id: ID,
  businessId: '0196f000-0000-7000-8000-0000000000a1',
  code: 'HLM-01',
  name: 'Helmet',
  nameBn: null,
  brand: 'Vega',
  category: null,
  unit: 'pcs',
  tracking: 'quantity',
  sellPrice: '2500.50',
  status: 'active',
  version: 1,
  createdAt: new Date('2026-11-23T00:00:00Z'),
  updatedAt: new Date('2026-11-23T00:00:00Z'),
  createdBy: USER,
  ...overrides,
});

class FakeProductQuery implements IProductQuery {
  rows: ProductRecord[] = [];
  listed: unknown[] = [];
  edited: ProductRecord | null = null;
  async find(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async list(filter: unknown) {
    this.listed.push(filter);
    return this.rows;
  }
  async create(input: { createdBy: string }) {
    return record({ createdBy: input.createdBy });
  }
  async edit() {
    return this.edited;
  }
}

const detail = {
  id: ID,
  code: 'HLM-01',
  name: 'Helmet',
  nameBn: null,
  brand: 'Vega',
  category: null,
  unit: 'pcs',
  tracking: 'quantity',
  sellPrice: '2500.50',
  status: 'active',
  version: 1,
};

describe('ProductManager (ADR 0052)', () => {
  it('get maps the row to the detail shape: money a string, no business id, no cost', async () => {
    const query = new FakeProductQuery();
    query.rows = [record()];
    expect(await new ProductManager(query).get(ID)).toEqual(detail);
  });

  it('get of an unknown or malformed id is 404 product.not_found', async () => {
    const manager = new ProductManager(new FakeProductQuery());
    for (const id of [ID, 'not-a-uuid']) {
      await expect(manager.get(id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('list asks for one more row than the page, and gives the last kept id as the next cursor', async () => {
    const query = new FakeProductQuery();
    const second = '0196f000-0000-7000-8000-000000000302';
    query.rows = [record(), record({ id: second }), record({ id: '0196f000-0000-7000-8000-000000000303' })];
    const page = await new ProductManager(query).list({ limit: 2, search: 'helm', status: 'active' });
    expect(query.listed).toEqual([{ limit: 3, search: 'helm', status: 'active', afterId: undefined }]);
    expect(page.items.map((item) => item.id)).toEqual([ID, second]);
    expect(page.nextCursor).toBe(second);
  });

  it('a cursor that is not an id is 400 VALIDATION_FAILED, before any query', async () => {
    const query = new FakeProductQuery();
    await expect(new ProductManager(query).list({ limit: 2, cursor: 'nope' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(query.listed).toEqual([]);
  });

  it('create records the caller as creator', async () => {
    const created = await new ProductManager(new FakeProductQuery()).create(
      {
        code: 'HLM-01',
        name: 'Helmet',
        nameBn: null,
        brand: null,
        category: null,
        unit: 'pcs',
        tracking: 'quantity',
        sellPrice: '2500.50',
      },
      USER,
    );
    expect(created).toEqual(detail);
  });

  it('3. an edit that matched nothing: present is 409 product.version_conflict, absent is 404 product.not_found', async () => {
    const query = new FakeProductQuery();
    query.rows = [record({ version: 2 })];
    const manager = new ProductManager(query);
    const stale = await manager.edit(ID, { version: 1, name: 'x' }).catch((caught: unknown) => caught);
    expect(stale).toBeInstanceOf(AppError);
    expect((stale as AppError).code).toBe('CONFLICT');
    expect((stale as AppError).fields.map((field) => field.code)).toEqual(['product.version_conflict']);
    const missing = await manager
      .edit('0196f000-0000-7000-8000-000000000399', { version: 1, name: 'x' })
      .catch((caught: unknown) => caught);
    expect((missing as AppError).code).toBe('NOT_FOUND');
  });

  it('an edit that matched returns the new detail', async () => {
    const query = new FakeProductQuery();
    query.edited = record({ name: 'Helmet XL', version: 2 });
    expect(await new ProductManager(query).edit(ID, { version: 1, name: 'Helmet XL' })).toEqual({
      ...detail,
      name: 'Helmet XL',
      version: 2,
    });
  });
});
