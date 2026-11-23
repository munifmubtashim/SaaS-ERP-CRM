import type { StockItem } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { filterStock, stockSummary } from './stock';

/** The Inventory stock list (design/owner-dashboard/Inventory.dc.html): search, status filter and summary. */
const item = (
  id: string,
  name: string,
  sku: string,
  status: StockItem['status'],
  valueAtCost?: string,
): StockItem => ({
  id,
  name,
  sku,
  category: 'Parts',
  onHand: '10',
  reserved: '0',
  reorderLevel: '5',
  status,
  ...(valueAtCost ? { valueAtCost } : {}),
});

const LIST = [
  item('oil', 'Engine oil 4T, 1 litre', 'PRT-OIL-0101', 'in_stock', '49920.00'),
  item('pads', 'Brake pad set, front', 'PRT-BRK-0202', 'low', '12000.50'),
  item('tyre', 'Rear tyre 130/70-17', 'PRT-TYR-0303', 'out', '0.00'),
];

describe('filterStock', () => {
  it('All shows every item; Low shows low; Out of stock shows out', () => {
    expect(filterStock(LIST, '', 'all').map((i) => i.id)).toEqual(['oil', 'pads', 'tyre']);
    expect(filterStock(LIST, '', 'low').map((i) => i.id)).toEqual(['pads']);
    expect(filterStock(LIST, '', 'out').map((i) => i.id)).toEqual(['tyre']);
  });

  it('searches the name or the SKU, without regard to case', () => {
    expect(filterStock(LIST, 'BRAKE', 'all').map((i) => i.id)).toEqual(['pads']);
    expect(filterStock(LIST, 'tyr-03', 'all').map((i) => i.id)).toEqual(['tyre']);
    expect(filterStock(LIST, ' oil ', 'low')).toEqual([]);
  });
});

describe('stockSummary', () => {
  it('value at cost through the money helpers, items tracked, and low or out counts', () => {
    expect(stockSummary(LIST)).toEqual({ valueAtCost: '61920.50', items: 3, low: 1, out: 1 });
  });

  it('hides the value when any item’s cost is hidden from this user', () => {
    expect(stockSummary([...LIST, item('x', 'Hidden', 'X-1', 'in_stock')]).valueAtCost).toBeNull();
  });
});
