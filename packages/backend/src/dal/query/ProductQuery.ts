import { AppError } from '@erp/shared';
import { Prisma } from '../generated/prisma/client.js';
import { ProductDTO, type ProductRow } from '../dto/ProductDTO.js';
import { BaseQuery } from './BaseQuery.js';

/** A new product. The business is the request's one business; the code and tracking never change afterwards. */
export interface NewProduct {
  code: string;
  name: string;
  nameBn: string | null;
  brand: string | null;
  category: string | null;
  unit: string;
  tracking: 'serial' | 'quantity';
  /** A decimal string, e.g. "2500.50"; Postgres stores it as numeric(18,2). */
  sellPrice: string;
  status?: 'active' | 'archived';
  createdBy: string;
}

/** The columns erp_app may change (the column grant in #105's migration); code and tracking are not among them. */
export type ProductChanges = Partial<
  Pick<NewProduct, 'name' | 'nameBn' | 'brand' | 'category' | 'unit' | 'sellPrice'> & {
    status: 'active' | 'archived';
  }
>;

export interface ProductFilter {
  /** Matched literally (no wildcards), without regard to case, in the name, code and brand. */
  search?: string;
  status?: 'active' | 'archived';
  /** The cursor: the last id of the previous page. Ids are UUID v7, so this is creation order. */
  afterId?: string;
  limit: number;
}

const COLUMNS = Prisma.sql`
  id::text AS id, business_id::text AS "businessId", code, name, name_bn AS "nameBn", brand, category, unit,
  tracking, sell_price::text AS "sellPrice", status, version, created_at AS "createdAt",
  updated_at AS "updatedAt", created_by::text AS "createdBy"`;

/**
 * Product module: database access (dal), ADR 0020 section 4. Satisfies businessLogic contracts/IProductQuery.
 * Owner: Munif. Runs inside the request's tenant transaction (BaseQuery); RLS limits every statement to the
 * request's businesses, so another business's product is never found, listed or edited.
 */
export class ProductQuery extends BaseQuery {
  async find(id: string): Promise<ProductDTO | null> {
    const [row] = await this.db.$queryRaw<
      ProductRow[]
    >`SELECT ${COLUMNS} FROM product WHERE id = ${id}::uuid`;
    return row ? ProductDTO.fromRow(row) : null;
  }

  async list(filter: ProductFilter): Promise<ProductDTO[]> {
    const where = [Prisma.sql`TRUE`];
    if (filter.search) {
      // strpos, not LIKE: a % or _ in the search is a character, not a wildcard.
      const term = filter.search.toLowerCase();
      where.push(Prisma.sql`(strpos(lower(name), ${term}) > 0 OR strpos(lower(code), ${term}) > 0
        OR strpos(lower(coalesce(brand, '')), ${term}) > 0)`);
    }
    if (filter.status) where.push(Prisma.sql`status = ${filter.status}`);
    if (filter.afterId) where.push(Prisma.sql`id > ${filter.afterId}::uuid`);
    const rows = await this.db.$queryRaw<ProductRow[]>`
      SELECT ${COLUMNS} FROM product WHERE ${Prisma.join(where, ' AND ')} ORDER BY id LIMIT ${filter.limit}`;
    return rows.map((row) => ProductDTO.fromRow(row));
  }

  /** Creates in the request's one business. A code already used in the business is 409 product.code_taken. */
  async create(input: NewProduct): Promise<ProductDTO> {
    await this.requireOneBusiness('A product');
    const [row] = await this.db.$queryRaw<ProductRow[]>`
      INSERT INTO product (business_id, code, name, name_bn, brand, category, unit, tracking, sell_price, status,
                           created_by)
      VALUES ((SELECT app_business_ids())[1], ${input.code}, ${input.name}, ${input.nameBn}, ${input.brand},
              ${input.category}, ${input.unit}, ${input.tracking}, ${input.sellPrice}::numeric,
              ${input.status ?? 'active'}, ${input.createdBy}::uuid)
      ON CONFLICT (business_id, code) DO NOTHING
      RETURNING ${COLUMNS}`;
    if (!row) {
      throw new AppError('CONFLICT', 'A product with this code already exists.', [
        { path: 'code', code: 'product.code_taken', message: 'A product with this code already exists.' },
      ]);
    }
    return ProductDTO.fromRow(row);
  }

  /**
   * The optimistic version check: one `UPDATE … WHERE id AND version = $read RETURNING`. Null means no row matched:
   * the product was changed since it was read, or isn't visible in this scope. The Manager tells them apart.
   */
  async edit(id: string, version: number, changes: ProductChanges): Promise<ProductDTO | null> {
    const sets = [Prisma.sql`version = version + 1`, Prisma.sql`updated_at = now()`];
    if (changes.name !== undefined) sets.push(Prisma.sql`name = ${changes.name}`);
    if (changes.nameBn !== undefined) sets.push(Prisma.sql`name_bn = ${changes.nameBn}`);
    if (changes.brand !== undefined) sets.push(Prisma.sql`brand = ${changes.brand}`);
    if (changes.category !== undefined) sets.push(Prisma.sql`category = ${changes.category}`);
    if (changes.unit !== undefined) sets.push(Prisma.sql`unit = ${changes.unit}`);
    if (changes.sellPrice !== undefined) sets.push(Prisma.sql`sell_price = ${changes.sellPrice}::numeric`);
    if (changes.status !== undefined) sets.push(Prisma.sql`status = ${changes.status}`);
    const [row] = await this.db.$queryRaw<ProductRow[]>`
      UPDATE product SET ${Prisma.join(sets, ', ')}
      WHERE id = ${id}::uuid AND version = ${version}
      RETURNING ${COLUMNS}`;
    return row ? ProductDTO.fromRow(row) : null;
  }
}
