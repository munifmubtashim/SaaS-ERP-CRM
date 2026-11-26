import {
  productDetailSchema,
  productListResponseSchema,
  productModelSummarySchema,
  type ProductCreate,
  type ProductDetail,
  type ProductEdit,
  type ProductListQueryInput,
  type ProductListResponse,
  type ProductModelSummary,
} from '@erp/shared';
import { z } from 'zod';
import type { IHttpClient, IHttpPatch } from './HttpClient';

/**
 * What the Products screen needs (design/owner-dashboard/Bikes.dc.html). Owner: Munif.
 * The catalogue calls use the routes on #131 (ADR 0052); the Models tab keeps its provisional shape (#135).
 */
export interface IProductService {
  /** Each model with its price and its units by state (counts only). Provisional: no route yet. */
  models(): Promise<ProductModelSummary[]>;
  /** One page of the active business's products: search by name, code or brand; filter by status. */
  list(query: ProductListQueryInput): Promise<ProductListResponse>;
  /** One product with its price and version; 404 product.not_found when it is not in the business. */
  get(id: string): Promise<ProductDetail>;
  /** Adds a product: 409 product.code_taken when the code is used in the business. */
  create(input: ProductCreate): Promise<ProductDetail>;
  /** Edits or archives with the version read: 409 product.version_conflict when someone changed it since. */
  edit(id: string, input: ProductEdit): Promise<ProductDetail>;
}

/** Each call is real or sample on its own key: models on `product`, the rest on `product.catalogue`. */
export type ProductCall = 'models' | 'list' | 'get' | 'create' | 'edit';

/** Product module: the API, one method per endpoint. */
export class ProductService implements IProductService {
  constructor(protected readonly http: IHttpClient & IHttpPatch) {}

  /** The path is provisional; the route doesn't exist yet. */
  models = () => this.http.getJson('/v1/products/models', z.array(productModelSummarySchema));

  /** GET /v1/products. Only the filters that are set go into the query string. */
  list(query: ProductListQueryInput): Promise<ProductListResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return this.http.getJson(`/v1/products${qs ? `?${qs}` : ''}`, productListResponseSchema);
  }

  /** GET /v1/products/:id. The shared schema drops unknown keys, so no cost reaches the screen. */
  get(id: string): Promise<ProductDetail> {
    return this.http.getJson(`/v1/products/${encodeURIComponent(id)}`, productDetailSchema);
  }

  /** POST /v1/products. */
  create(input: ProductCreate): Promise<ProductDetail> {
    return this.http.postJson('/v1/products', input, productDetailSchema);
  }

  /** PATCH /v1/products/:id. Archiving is `{ version, status: 'archived' }`: a product is never deleted. */
  edit(id: string, input: ProductEdit): Promise<ProductDetail> {
    return this.http.patchJson(`/v1/products/${encodeURIComponent(id)}`, input, productDetailSchema);
  }
}

/** Real or sample per call, like PartyServiceSwitch: the screens show the Demo data badge for a sample call. */
export class ProductServiceSwitch implements IProductService {
  constructor(
    private readonly real: IProductService,
    private readonly sample: IProductService,
    private readonly useSample: (call: ProductCall) => boolean,
  ) {}
  private pick(call: ProductCall): IProductService {
    return this.useSample(call) ? this.sample : this.real;
  }
  models = () => this.pick('models').models();
  list = (query: ProductListQueryInput) => this.pick('list').list(query);
  get = (id: string) => this.pick('get').get(id);
  create = (input: ProductCreate) => this.pick('create').create(input);
  edit = (id: string, input: ProductEdit) => this.pick('edit').edit(id, input);
}
