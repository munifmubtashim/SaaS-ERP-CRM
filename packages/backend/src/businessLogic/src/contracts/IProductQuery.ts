/** A product row as the Manager needs it (dal's ProductDTO satisfies it). Money is a string; there is no cost. */
export interface ProductRecord {
  id: string;
  businessId: string;
  code: string;
  name: string;
  nameBn: string | null;
  brand: string | null;
  category: string | null;
  unit: string;
  tracking: 'serial' | 'quantity';
  sellPrice: string;
  status: 'active' | 'archived';
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface NewProductRecord {
  code: string;
  name: string;
  nameBn: string | null;
  brand: string | null;
  category: string | null;
  unit: string;
  tracking: 'serial' | 'quantity';
  sellPrice: string;
  createdBy: string;
}

export type ProductRecordChanges = Partial<
  Pick<ProductRecord, 'name' | 'nameBn' | 'brand' | 'category' | 'unit' | 'sellPrice' | 'status'>
>;

/** What ProductManager needs from the database. Owned by businessLogic; dal's ProductQuery (#124) satisfies it. */
export interface IProductQuery {
  find(id: string): Promise<ProductRecord | null>;
  list(filter: {
    search?: string;
    status?: 'active' | 'archived';
    afterId?: string;
    limit: number;
  }): Promise<ProductRecord[]>;
  create(input: NewProductRecord): Promise<ProductRecord>;
  /** Null when the version is stale or the product isn't visible in the request's scope. */
  edit(id: string, version: number, changes: ProductRecordChanges): Promise<ProductRecord | null>;
}
