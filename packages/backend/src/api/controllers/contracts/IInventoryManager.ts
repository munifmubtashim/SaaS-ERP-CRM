import type { PosCatalog, StockListQuery, StockListResponse } from '@erp/shared';

/** What InventoryController needs. Owned by api; businessLogic's InventoryManager satisfies it. */
export interface IInventoryManager {
  /** GET /v1/stock (#34's shape). */
  list(request: StockListQuery): Promise<StockListResponse>;
  /** GET /v1/stock/pos-catalog (#198). */
  posCatalog(branchId: string): Promise<PosCatalog>;
}
