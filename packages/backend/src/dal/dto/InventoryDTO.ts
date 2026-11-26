import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Inventory module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class InventoryDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): InventoryDTO {
    return new InventoryDTO(row);
  }
}

/** A serial unit as plain values (ADR 0020 section 1), without its cost: a hidden field (section 3). */
export interface SerialUnitRow extends BaseRow {
  branchId: string;
  productId: string;
  serialNo: string;
  status: 'in_stock' | 'reserved' | 'sold' | 'delivered';
  invoiceId: string | null;
  reservedByRef: string | null;
}

/**
 * One physical unit (a bike) as dal returns it. There is deliberately no `unitCost`: until redaction exists, no
 * list or detail DTO carries the cost (ADR 0020 section 3). Only `SerialUnitQuery.sell` returns it, to the sale.
 */
export class SerialUnitDTO extends BaseDTO {
  declare readonly branchId: string;
  readonly productId: string;
  readonly serialNo: string;
  readonly status: SerialUnitRow['status'];
  readonly invoiceId: string | null;
  readonly reservedByRef: string | null;

  private constructor(row: SerialUnitRow) {
    super(row);
    this.productId = row.productId;
    this.serialNo = row.serialNo;
    this.status = row.status;
    this.invoiceId = row.invoiceId;
    this.reservedByRef = row.reservedByRef;
  }

  static fromRow(row: SerialUnitRow): SerialUnitDTO {
    return new SerialUnitDTO(row);
  }
}
