import {
  AppError,
  type ProductCreate,
  type ProductDetail,
  type ProductEdit,
  type ProductListQuery,
  type ProductListResponse,
} from '@erp/shared';
import type { IProductQuery, ProductRecord } from './contracts/IProductQuery.js';

/** A UUID in its text form; anything else can't be a product id, so it is answered before any query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);

/** The detail shape: no business id (the scope says it), no cost (ADR 0020 section 3). */
function toDetail(row: ProductRecord): ProductDetail {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameBn: row.nameBn,
    brand: row.brand,
    category: row.category,
    unit: row.unit,
    tracking: row.tracking,
    sellPrice: row.sellPrice,
    status: row.status,
    version: row.version,
  };
}

const notFound = () =>
  new AppError('NOT_FOUND', 'Product not found.', [
    { path: 'id', code: 'product.not_found', message: 'Product not found.' },
  ]);

/**
 * Product module: business rules (ADR 0052 section 3). No Express, no SQL. Owner: Munif. Runs inside the request's
 * tenant transaction, so every Query call is limited to the request's business by RLS.
 */
export class ProductManager {
  constructor(private readonly query: IProductQuery) {}

  async list(
    request: Pick<ProductListQuery, 'limit'> & Partial<ProductListQuery>,
  ): Promise<ProductListResponse> {
    if (request.cursor !== undefined && !isId(request.cursor)) {
      throw new AppError('VALIDATION_FAILED', 'The page cursor is not valid.', [
        { path: 'cursor', code: 'page.cursor_invalid', message: 'Start the list again from the first page.' },
      ]);
    }
    // One extra row says whether another page exists, without a count.
    const rows = await this.query.list({
      limit: request.limit + 1,
      search: request.search,
      status: request.status,
      afterId: request.cursor,
    });
    const page = rows.slice(0, request.limit);
    const items = page.map(({ id, code, name, brand, unit, tracking, status }) => ({
      id,
      code,
      name,
      brand,
      unit,
      tracking,
      status,
    }));
    return { items, nextCursor: rows.length > request.limit ? (page.at(-1)?.id ?? null) : null };
  }

  async get(id: string): Promise<ProductDetail> {
    if (!isId(id)) throw notFound();
    const row = await this.query.find(id);
    if (!row) throw notFound();
    return toDetail(row);
  }

  /** The creator is the caller (req.auth), never the body. A used code is 409 product.code_taken (the Query). */
  async create(input: ProductCreate, createdBy: string): Promise<ProductDetail> {
    return toDetail(await this.query.create({ ...input, createdBy }));
  }

  /**
   * The optimistic version check (ADR 0052 section 3): the Query's UPDATE matched nothing, so the product either
   * changed since it was read (409 product.version_conflict) or isn't there for this request (404).
   */
  async edit(id: string, edit: ProductEdit): Promise<ProductDetail> {
    if (!isId(id)) throw notFound();
    const { version, ...changes } = edit;
    const edited = await this.query.edit(id, version, changes);
    if (edited) return toDetail(edited);
    if (!(await this.query.find(id))) throw notFound();
    throw new AppError('CONFLICT', 'This product was changed by someone else. Reload it and try again.', [
      {
        path: 'version',
        code: 'product.version_conflict',
        message: 'This product was changed by someone else. Reload it and try again.',
      },
    ]);
  }
}
