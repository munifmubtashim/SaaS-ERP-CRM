import { stockItemDetailSchema, stockItemSchema, stockMovementSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IHttpClient } from './HttpClient';
import { InventoryService } from './inventoryService';
import { SampleInventoryService, stockStatus } from './sample/SampleInventoryService';

/** The Inventory screen's reads (design/owner-dashboard/Inventory.dc.html): stock list, an item, movements. */
class RecordingHttp implements IHttpClient {
  gets: string[] = [];
  getJson = (path: string) => {
    this.gets.push(path);
    return Promise.reject(new Error('no API in this test'));
  };
  postJson = () => Promise.reject(new Error('unused'));
  post = () => Promise.reject(new Error('unused'));
}

describe('InventoryService (the API)', () => {
  it('reads the stock list, one item and the movements on provisional paths', async () => {
    const http = new RecordingHttp();
    const api = new InventoryService(http);
    await api.stockItems().catch(() => undefined);
    await api.stockItem('brake pads').catch(() => undefined);
    await api.movements().catch(() => undefined);
    await api.movements('pads').catch(() => undefined);
    expect(http.gets).toEqual([
      '/v1/stock/items',
      '/v1/stock/items/brake%20pads',
      '/v1/stock/movements',
      '/v1/stock/movements?itemId=pads',
    ]);
  });
});

describe('stockStatus (the design’s rule, standing in for the backend)', () => {
  it('out when nothing is on hand', () => {
    expect(stockStatus({ onHand: '0', reserved: '0', reorderLevel: '10' })).toBe('out');
  });

  it('low when what is free (on hand less reserved) is at or below the reorder level', () => {
    expect(stockStatus({ onHand: '46', reserved: '6', reorderLevel: '40' })).toBe('low');
    expect(stockStatus({ onHand: '47', reserved: '6', reorderLevel: '40' })).toBe('in_stock');
    expect(stockStatus({ onHand: '5.500', reserved: '0', reorderLevel: '5.5' })).toBe('low');
  });
});

describe('SampleInventoryService', () => {
  const sample = () => new SampleInventoryService(0, '2026-11-12');

  it('lists invented parts and accessories in the shared shape, every status present, status by the rule', async () => {
    const items = await sample().stockItems();
    expect(items.length).toBeGreaterThanOrEqual(8);
    for (const item of items) {
      expect(stockItemSchema.parse(item)).toEqual(item);
      expect(item.status).toBe(stockStatus(item));
    }
    expect(new Set(items.map((i) => i.status))).toEqual(new Set(['in_stock', 'low', 'out']));
  });

  it('opens an item with its stock at each branch adding up to the total, and its unit cost', async () => {
    const service = sample();
    const [first] = await service.stockItems();
    const detail = await service.stockItem(first?.id ?? '');
    expect(stockItemDetailSchema.parse(detail)).toEqual(detail);
    const sum = detail.byBranch.reduce((n, b) => n + Number(b.onHand), 0);
    expect(String(sum)).toBe(detail.onHand);
    expect(detail.unitCost).toBeDefined();
    await expect(service.stockItem('nothing')).rejects.toThrow('stock.item_not_found');
  });

  it('lists movements newest first, dated up to the given day, and an item’s own when asked', async () => {
    const service = sample();
    const all = await service.movements();
    for (const m of all) expect(stockMovementSchema.parse(m)).toEqual(m);
    expect(all.map((m) => m.at)).toEqual([...all.map((m) => m.at)].sort().reverse());
    expect(all.every((m) => m.at.slice(0, 10) <= '2026-11-12')).toBe(true);
    const [first] = await service.stockItems();
    const own = await service.movements(first?.id);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((m) => m.itemName === first?.name)).toBe(true);
  });
});
