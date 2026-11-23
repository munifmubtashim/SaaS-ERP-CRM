import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Organization module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class OrganizationDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): OrganizationDTO {
    return new OrganizationDTO(row);
  }
}

/** A business row as plain values (ADR 0009). The tenant root, so it carries no business_id of its own. */
export interface BusinessRow {
  id: string;
  organizationId: string;
  legalEntityId: string;
  name: string;
  isActive: boolean;
  version: number;
  createdAt: Date;
  /** The Owner who created it; NULL only when seeded (#27). */
  createdBy: string | null;
}

/** A business as dal returns it. Not a BaseDTO: a business is the scope, not a row inside one. */
export class BusinessDTO {
  private constructor(
    readonly id: string,
    readonly organizationId: string,
    readonly legalEntityId: string,
    readonly name: string,
    readonly isActive: boolean,
    readonly version: number,
    readonly createdAt: Date,
    readonly createdBy: string | null,
  ) {}

  static fromRow(row: BusinessRow): BusinessDTO {
    return new BusinessDTO(
      row.id,
      row.organizationId,
      row.legalEntityId,
      row.name,
      row.isActive,
      row.version,
      row.createdAt,
      row.createdBy,
    );
  }
}

/** A branch row as plain values (ADR 0009). */
export interface BranchRow {
  id: string;
  businessId: string;
  name: string;
  shortCode: string;
  isActive: boolean;
  version: number;
  createdAt: Date;
  createdBy: string | null;
}

/** A branch as dal returns it. */
export class BranchDTO {
  private constructor(
    readonly id: string,
    readonly businessId: string,
    readonly name: string,
    readonly shortCode: string,
    readonly isActive: boolean,
    readonly version: number,
    readonly createdAt: Date,
    readonly createdBy: string | null,
  ) {}

  static fromRow(row: BranchRow): BranchDTO {
    return new BranchDTO(
      row.id,
      row.businessId,
      row.name,
      row.shortCode,
      row.isActive,
      row.version,
      row.createdAt,
      row.createdBy,
    );
  }
}
