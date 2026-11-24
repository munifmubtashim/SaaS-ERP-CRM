import { AppError, type PosCatalog, type StockListQuery, type StockListResponse } from '@erp/shared';
import type { IInventoryQuery } from './contracts/IInventoryQuery.js';
import type { IStockReadQuery } from './contracts/IStockReadQuery.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The page cursor is the last row's "productId.branchId"; anything else is refused, never guessed. */
function decodeCursor(cursor: string | undefined): { productId: string; branchId: string } | null {
  if (cursor === undefined) return null;
  const [productId = '', branchId = '', ...rest] = cursor.split('.');
  if (rest.length > 0 || !UUID.test(productId) || !UUID.test(branchId)) {
    throw new AppError('VALIDATION_FAILED', 'The page cursor is not valid.', [
      { path: 'cursor', code: 'page.cursor_invalid', message: 'Start the list again from the first page.' },
    ]);
  }
  return { productId, branchId };
}

/**
 * Inventory module: business rules. No Express, no SQL. Owner: Munif.
 * The stock reads (Munif, 24 Nov): GET /v1/stock for the inventory page (#34's shape, cursor paged) and
 * GET /v1/stock/pos-catalog for the POS (#198). Both come from the stock ledger's cache under the caller's RLS; no
 * cost ever leaves (plan 2.5).
 */
export class InventoryManager {
  constructor(
    protected readonly query: IInventoryQuery,
    private readonly stock: IStockReadQuery,
  ) {}

  async list(request: StockListQuery): Promise<StockListResponse> {
    const rows = await this.stock.stockRows({
      search: request.search,
      branchId: request.branchId ?? null,
      after: decodeCursor(request.cursor),
      limit: request.limit + 1,
    });
    const page = rows.slice(0, request.limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor: rows.length > request.limit && last ? `${last.productId}.${last.branchId}` : null,
    };
  }

  async posCatalog(branchId: string): Promise<PosCatalog> {
    const [walkInPartyId, items] = [
      await this.query.walkInPartyId(),
      await this.stock.posCatalogItems(branchId),
    ];
    return {
      walkInPartyId,
      items: items.map((item) => ({
        ...item,
        tracking: item.tracking === 'serial' ? 'serial' : 'quantity',
      })),
    };
  }
}
