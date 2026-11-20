import { productListResponseSchema, type ProductListQueryInput, type ProductListResponse } from '@erp/shared';
import { toQueryString, type IHttpClient } from './HttpClient';

/** What the product list needs from Product. One small method per use (interface segregation). */
export interface IProductService {
  /** One page of products in the active business. */
  list(query: ProductListQueryInput): Promise<ProductListResponse>;
}

/**
 * Product module: frontend API calls, one method per endpoint. Owner: Munif.
 * createServices uses MockProductService until GET /v1/products exists (catalogue tables not yet planned).
 */
export class ProductService implements IProductService {
  constructor(protected readonly http: IHttpClient) {}

  /** GET /v1/products. Only the filters that are set go into the query string. */
  list(query: ProductListQueryInput): Promise<ProductListResponse> {
    return this.http.getJson(`/v1/products${toQueryString(query)}`, productListResponseSchema);
  }
}
