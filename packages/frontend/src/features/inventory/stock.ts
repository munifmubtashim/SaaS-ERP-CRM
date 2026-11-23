import { formatMoney, parseMoney, sumMoney, type StockItem } from '@erp/shared';

export type StockFilter = 'all' | 'low' | 'out';

/** The design's stock list filter: All, Low or Out of stock, then a search in the name or the SKU, any case. */
export function filterStock(items: readonly StockItem[], search: string, filter: StockFilter): StockItem[] {
  const term = search.trim().toLowerCase();
  return items.filter(
    (item) =>
      (filter === 'all' || item.status === filter) &&
      (!term || item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term)),
  );
}

/**
 * The design's summary: stock value at cost (null when any item's cost is hidden from this user, plan 2.5), items
 * tracked, and how many are low or out of stock. Money is added only through the shared helpers.
 */
export function stockSummary(items: readonly StockItem[]): {
  valueAtCost: string | null;
  items: number;
  low: number;
  out: number;
} {
  const values = items.map((item) => item.valueAtCost);
  const allShown = values.every((value): value is string => value !== undefined);
  return {
    valueAtCost: allShown ? formatMoney(sumMoney(values.map(parseMoney))) : null,
    items: items.length,
    low: items.filter((item) => item.status === 'low').length,
    out: items.filter((item) => item.status === 'out').length,
  };
}
