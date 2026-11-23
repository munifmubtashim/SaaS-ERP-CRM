import {
  stockItemDetailSchema,
  stockItemSchema,
  stockMovementSchema,
  type StockItem,
  type StockItemDetail,
  type StockMovement,
} from '@erp/shared';
import { z } from 'zod';
import type { IHttpClient } from './HttpClient';

/**
 * What the Inventory screen reads (design/owner-dashboard/Inventory.dc.html, list half). Owner: Munif.
 * Provisional, like the shapes it uses (#134): stock per branch, never per location (ADR 0034 decides that).
 * Adjustments, counts and transfers come later (TODO(Munif), roadmap 4.3, 5.5).
 */
export interface IInventoryService {
  /** Parts and accessories across the business's branches, with the stock status. */
  stockItems(): Promise<StockItem[]>;
  /** One item with its stock at each branch and, for callers allowed to see cost, its unit cost. */
  stockItem(id: string): Promise<StockItemDetail>;
  /** Stock movements, newest first; one item's own when `itemId` is given. */
  movements(itemId?: string): Promise<StockMovement[]>;
}

/** Inventory module: the API. The paths are provisional; none of these routes exists yet (ADR 0021, 0054). */
export class InventoryService implements IInventoryService {
  constructor(protected readonly http: IHttpClient) {}
  stockItems = () => this.http.getJson('/v1/stock/items', z.array(stockItemSchema));
  stockItem = (id: string) =>
    this.http.getJson(`/v1/stock/items/${encodeURIComponent(id)}`, stockItemDetailSchema);
  movements = (itemId?: string) =>
    this.http.getJson(
      itemId ? `/v1/stock/movements?itemId=${encodeURIComponent(itemId)}` : '/v1/stock/movements',
      z.array(stockMovementSchema),
    );
}
