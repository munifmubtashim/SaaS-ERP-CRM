import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Report module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ReportDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): ReportDTO {
    return new ReportDTO(row);
  }
}
