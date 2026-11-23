import { productModelSummarySchema, type ProductModelSummary } from '@erp/shared';
import { z } from 'zod';
import type { IHttpClient } from './HttpClient';

/**
 * What the Products screen reads from the core catalogue (design/owner-dashboard/Bikes.dc.html, Models). Owner: Munif.
 * Provisional, like the shape it uses (#135); the catalogue itself comes with #34 and ADR 0052 (roadmap 5.4).
 */
export interface IProductService {
  /** Each model with its price and its units by state (counts only). */
  models(): Promise<ProductModelSummary[]>;
}

/** Product module: the API. The path is provisional; the route doesn't exist yet. */
export class ProductService implements IProductService {
  constructor(protected readonly http: IHttpClient) {}
  models = () => this.http.getJson('/v1/products/models', z.array(productModelSummarySchema));
}
