import { productListResponseSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { MockProductService } from './MockProductService';

const mock = () => new MockProductService(0);

describe('MockProductService', () => {
  it('returns rows that pass the shared schema', async () => {
    const page = await mock().list({});
    expect(productListResponseSchema.safeParse(page).success).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('searches name, code and brand, ignoring case', async () => {
    const byName = await mock().list({ search: 'BRAKE' });
    expect(byName.items.length).toBeGreaterThan(0);
    expect(
      byName.items.every((p) => `${p.code} ${p.name} ${p.brand ?? ''}`.toLowerCase().includes('brake')),
    ).toBe(true);
    expect((await mock().list({ search: 'no such product' })).items).toEqual([]);
  });

  it('filters by status', async () => {
    const archived = await mock().list({ status: 'archived' });
    expect(archived.items.length).toBeGreaterThan(0);
    expect(archived.items.every((p) => p.status === 'archived')).toBe(true);
  });

  it('pages with a cursor until nextCursor is null, never repeating a row', async () => {
    const service = mock();
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list({ limit: 2, cursor });
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe((await service.list({ limit: 100 })).items.length);
  });
});
