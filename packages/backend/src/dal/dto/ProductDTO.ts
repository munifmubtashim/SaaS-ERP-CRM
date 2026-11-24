import { BaseDTO, type BaseRow } from './BaseDTO.js';

/** A product row as plain values (ADR 0020 section 1). Money is a string; business-level, so no branch. */
export interface ProductRow extends Omit<BaseRow, 'branchId'> {
  code: string;
  name: string;
  nameBn: string | null;
  brand: string | null;
  category: string | null;
  unit: string;
  tracking: 'serial' | 'quantity';
  /** numeric(18,2) as text, e.g. "125000.00". Never a JavaScript number. */
  sellPrice: string;
  status: 'active' | 'archived';
}

/**
 * Product module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Munif.
 * No cost here: the product row has none, and a unit's cost is never in a list or detail DTO (ADR 0020 section 3).
 */
export class ProductDTO extends BaseDTO {
  readonly code: string;
  readonly name: string;
  readonly nameBn: string | null;
  readonly brand: string | null;
  readonly category: string | null;
  readonly unit: string;
  readonly tracking: 'serial' | 'quantity';
  readonly sellPrice: string;
  readonly status: 'active' | 'archived';

  private constructor(row: ProductRow) {
    super({ ...row, branchId: null });
    this.code = row.code;
    this.name = row.name;
    this.nameBn = row.nameBn;
    this.brand = row.brand;
    this.category = row.category;
    this.unit = row.unit;
    this.tracking = row.tracking;
    this.sellPrice = row.sellPrice;
    this.status = row.status;
  }

  static fromRow(row: ProductRow): ProductDTO {
    return new ProductDTO(row);
  }
}
