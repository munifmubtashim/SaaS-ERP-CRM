import { AppError } from '@erp/shared';
import type { Prisma } from '../generated/prisma/client.js';

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

  /**
   * A numeric(18,2) column as a money string ("12500.00"). Never `toString()`: it drops trailing zeros.
   * A NOT NULL column gives `string`, a nullable one `string | null`, so a DTO needs no cast.
   */
  protected static moneyFromDecimal(value: Prisma.Decimal): string;
  protected static moneyFromDecimal(value: Prisma.Decimal | null): string | null;
  protected static moneyFromDecimal(value: Prisma.Decimal | null): string | null {
    return BaseDTO.fixedScale(value, 2);
  }

  /** A numeric(18,3) column as a quantity string ("1.500"), typed like `moneyFromDecimal`. */
  protected static quantityFromDecimal(value: Prisma.Decimal): string;
  protected static quantityFromDecimal(value: Prisma.Decimal | null): string | null;
  protected static quantityFromDecimal(value: Prisma.Decimal | null): string | null {
    return BaseDTO.fixedScale(value, 3);
  }

  /**
   * Pads to `scale` decimals. Never rounds: more decimals means the wrong column was mapped. NaN and Infinity,
   * which a numeric column can hold, are never money or a quantity, so they throw too.
   */
  private static fixedScale(value: Prisma.Decimal | null, scale: number): string | null {
    if (value === null) return null;
    if (!value.isFinite()) {
      throw new AppError('INTERNAL_ERROR', 'A decimal column holds NaN or Infinity');
    }
    if (value.decimalPlaces() > scale) {
      throw new AppError('INTERNAL_ERROR', `A decimal column has more than ${scale} decimals`);
    }
    return value.toFixed(scale);
  }
}
