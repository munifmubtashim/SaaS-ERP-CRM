import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Crm module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Farhan.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class CrmDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): CrmDTO {
    return new CrmDTO(row);
  }
}
