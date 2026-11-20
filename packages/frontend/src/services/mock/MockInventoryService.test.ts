import { stockListResponseSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { MockInventoryService } from './MockInventoryService';

const mock = () => new MockInventoryService(0);

describe('MockInventoryService', () => {
  it('returns rows that pass the shared schema, never negative', async () => {
    const page = await mock().stock({});
    expect(stockListResponseSchema.safeParse(page).success).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('filters by branch and searches product name and code', async () => {
    const all = await mock().stock({ limit: 100 });
    const branchId = all.items[0]?.branchId as string;
    const oneBranch = await mock().stock({ branchId, limit: 100 });
    expect(oneBranch.items.length).toBeGreaterThan(0);
    expect(oneBranch.items.length).toBeLessThan(all.items.length);
    expect(oneBranch.items.every((r) => r.branchId === branchId)).toBe(true);
    const oil = await mock().stock({ search: 'OIL' });
    expect(oil.items.length).toBeGreaterThan(0);
    expect(oil.items.every((r) => r.productName.toLowerCase().includes('oil'))).toBe(true);
  });

  it('pages with a cursor until nextCursor is null', async () => {
    const service = mock();
    let cursor: string | undefined;
    let count = 0;
    do {
      const page = await service.stock({ limit: 3, cursor });
      count += page.items.length;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(count).toBe((await service.stock({ limit: 100 })).items.length);
  });
});
