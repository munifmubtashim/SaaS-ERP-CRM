import type { StockListQueryInput, StockListResponse, StockRow } from '@erp/shared';
import type { IInventoryService } from '../inventoryService';

const id = (n: number) => `0196f000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const UTTARA = { branchId: id(162), branchName: 'Uttara' };
const AGRABAD = { branchId: id(178), branchName: 'Agrabad' };

const row = (n: number, code: string, name: string, branch: typeof UTTARA, onHand: string): StockRow => ({
  productId: id(n),
  productCode: code,
  productName: name,
  ...branch,
  onHand,
});

/** Invented sample stock: fictional products and branches, no real business. */
const STOCK: StockRow[] = [
  row(201, 'P-0001', 'Padma 110 Standard', UTTARA, '7.000'),
  row(201, 'P-0001', 'Padma 110 Standard', AGRABAD, '3.000'),
  row(202, 'P-0002', 'Padma 125 Disc', UTTARA, '2.000'),
  row(203, 'P-0003', 'Meghna 150 Sport', AGRABAD, '0.000'),
  row(205, 'P-0101', 'Engine oil 10W-30, 1 litre', UTTARA, '1240.000'),
  row(205, 'P-0101', 'Engine oil 10W-30, 1 litre', AGRABAD, '386.000'),
  row(206, 'P-0102', 'Front brake pad', UTTARA, '48.000'),
  row(207, 'P-0103', 'Rear brake shoe', AGRABAD, '0.000'),
  row(208, 'P-0104', 'Full-face helmet, size L', UTTARA, '15.000'),
];

/** Stands in for GET /v1/stock until the stock tables exist. Filters and pages like the API will. */
export class MockInventoryService implements IInventoryService {
  constructor(private readonly delayMs = 400) {}

  async stock(query: StockListQueryInput): Promise<StockListResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const search = query.search?.trim().toLowerCase();
    const matches = STOCK.filter(
      (r) =>
        (!query.branchId || r.branchId === query.branchId) &&
        (!search || `${r.productCode} ${r.productName}`.toLowerCase().includes(search)),
    );
    const start = query.cursor ? Number(query.cursor) : 0;
    const end = start + Number(query.limit ?? 25);
    return { items: matches.slice(start, end), nextCursor: end < matches.length ? String(end) : null };
  }
}
