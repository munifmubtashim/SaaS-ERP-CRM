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
