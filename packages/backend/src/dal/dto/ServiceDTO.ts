import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Service module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Farhan.
 * TODO(Farhan): workshop job cards, warranty (roadmap 5.10).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ServiceDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): ServiceDTO {
    return new ServiceDTO(row);
  }
}
