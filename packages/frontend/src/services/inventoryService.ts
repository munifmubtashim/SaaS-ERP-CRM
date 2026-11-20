import { stockListResponseSchema, type StockListQueryInput, type StockListResponse } from '@erp/shared';
import { toQueryString, type IHttpClient } from './HttpClient';

/** What the stock-on-hand list needs from Inventory. One small method per use (interface segregation). */
export interface IInventoryService {
  /** One page of on-hand rows (one product in one branch) in the active business. */
  stock(query: StockListQueryInput): Promise<StockListResponse>;
}

/**
 * Inventory module: frontend API calls, one method per endpoint. Owner: Munif.
 * createServices uses MockInventoryService until GET /v1/stock exists (stock tables not yet planned).
 */
export class InventoryService implements IInventoryService {
  constructor(protected readonly http: IHttpClient) {}

  /** GET /v1/stock. Only the filters that are set go into the query string. */
  stock(query: StockListQueryInput): Promise<StockListResponse> {
    return this.http.getJson(`/v1/stock${toQueryString(query)}`, stockListResponseSchema);
  }
}
