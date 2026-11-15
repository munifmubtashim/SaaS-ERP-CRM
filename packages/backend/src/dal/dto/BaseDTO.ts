/**
 * Columns every business-owned row carries, as plain values. Queries map Prisma results to this
 * shape before building a DTO, so no Prisma type ever leaves dal.
 */
export interface BaseRow {
  /** UUID v7 */
  id: string;
  businessId: string;
  /** Present on branch-scoped tables only. */
  branchId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  /** Optimistic-locking version. */
  version: number;
}

/**
 * Base of every business-row DTO. Subclasses add their own columns and expose a static
 * `fromRow(row)` mapping method; the constructor stays private so mapping is always explicit.
 * Money columns are strings (numeric(18,2)), never JavaScript numbers.
 */
export abstract class BaseDTO {
  readonly id: string;
  readonly businessId: string;
  readonly branchId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly version: number;

  protected constructor(row: BaseRow) {
    this.id = row.id;
    this.businessId = row.businessId;
    this.branchId = row.branchId;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
    this.createdBy = row.createdBy;
    this.version = row.version;
  }
}
