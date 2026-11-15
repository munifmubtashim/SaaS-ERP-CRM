import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Party module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Farhan.
 * TODO(Farhan): customers, suppliers, contacts, dues (roadmap 5.3).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class PartyDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): PartyDTO {
    return new PartyDTO(row);
  }
}
