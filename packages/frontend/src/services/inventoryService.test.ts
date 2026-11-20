import { describe, expect, it, vi } from 'vitest';
import type { IHttpClient } from './HttpClient';
import { InventoryService } from './inventoryService';

function fakeHttp() {
  const getJson = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
  return { http: { getJson: getJson as IHttpClient['getJson'] }, getJson };
}

describe('InventoryService', () => {
  it('GETs /v1/stock with only the filters that are set', async () => {
    const { http, getJson } = fakeHttp();
    const branchId = '0196f000-0000-7000-8000-0000000000a2';
    await new InventoryService(http).stock({ branchId, search: 'oil' });
    expect(getJson).toHaveBeenCalledWith(`/v1/stock?branchId=${branchId}&search=oil`, expect.anything());
  });
});
