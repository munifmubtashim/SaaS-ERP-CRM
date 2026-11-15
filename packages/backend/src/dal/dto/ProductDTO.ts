import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Product module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ProductDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): ProductDTO {
    return new ProductDTO(row);
  }
}
