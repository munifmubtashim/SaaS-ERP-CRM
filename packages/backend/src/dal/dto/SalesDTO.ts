import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Sales module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class SalesDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): SalesDTO {
    return new SalesDTO(row);
  }
}
