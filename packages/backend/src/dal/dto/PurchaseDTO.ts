import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Purchase module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class PurchaseDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): PurchaseDTO {
    return new PurchaseDTO(row);
  }
}
