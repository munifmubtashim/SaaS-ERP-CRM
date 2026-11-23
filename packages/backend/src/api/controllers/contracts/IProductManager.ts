import type {
  ProductCreate,
  ProductDetail,
  ProductEdit,
  ProductListQuery,
  ProductListResponse,
} from '@erp/shared';

/** What ProductController needs from businessLogic (ADR 0052 section 3). Owned by api; ProductManager satisfies it. */
export interface IProductManager {
  list(query: ProductListQuery): Promise<ProductListResponse>;
  get(id: string): Promise<ProductDetail>;
  create(input: ProductCreate, createdBy: string): Promise<ProductDetail>;
  edit(id: string, edit: ProductEdit): Promise<ProductDetail>;
}
