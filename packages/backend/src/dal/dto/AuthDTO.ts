import { BaseDTO, type BaseRow } from './BaseDTO.js';

/**
 * Auth module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class AuthDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }

  static fromRow(row: BaseRow): AuthDTO {
    return new AuthDTO(row);
  }
}

/** What login needs from a user row (ADR 0018 section 4). The hash never leaves dal and businessLogic. */
export interface LoginUserRow {
  id: string;
  organizationId: string;
  passwordHash: string;
  isActive: boolean;
  lockedUntil: Date | null;
  failedAttempts: number;
  displayName: string;
}

export class LoginUserDTO {
  private constructor(
    readonly id: string,
    readonly organizationId: string,
    readonly passwordHash: string,
    readonly isActive: boolean,
    readonly lockedUntil: Date | null,
    readonly failedAttempts: number,
    readonly displayName: string,
  ) {}

  static fromRow(row: LoginUserRow): LoginUserDTO {
    return new LoginUserDTO(
      row.id,
      row.organizationId,
      row.passwordHash,
      row.isActive,
      row.lockedUntil,
      row.failedAttempts,
      row.displayName,
    );
  }
}

/** An active session row (ADR 0018 section 6). The token hash stays in dal. */
export interface SessionRow {
  id: string;
  userId: string;
  organizationId: string;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export class SessionDTO {
  private constructor(
    readonly sessionId: string,
    readonly userId: string,
    readonly organizationId: string,
    readonly lastSeenAt: Date,
    readonly idleExpiresAt: Date,
    readonly absoluteExpiresAt: Date,
  ) {}

  static fromRow(row: SessionRow): SessionDTO {
    return new SessionDTO(
      row.id,
      row.userId,
      row.organizationId,
      row.lastSeenAt,
      row.idleExpiresAt,
      row.absoluteExpiresAt,
    );
  }
}

/** One role a user holds for a business and branch, with its active permission codes (ADR 0051). */
export interface ScopeRow {
  role: string;
  permissions: string[];
}

/** What a user may do in one business and branch: their roles there, and the union of those roles' permissions. */
export class ScopeDTO {
  private constructor(
    readonly roles: string[],
    readonly permissions: string[],
  ) {}

  static fromRows(rows: readonly ScopeRow[]): ScopeDTO {
    const permissions = [...new Set(rows.flatMap((row) => row.permissions))].sort();
    return new ScopeDTO(
      rows.map((row) => row.role),
      permissions,
    );
  }
}

/** One row of GET /v1/me/businesses before grouping: an active business and one of its active branches (ADR 0060). */
export interface MyBranchRow {
  businessId: string;
  businessName: string;
  branchId: string;
  branchName: string;
  shortCode: string;
}

/** A branch the user may use: id, name and short code only. */
export class MyBranchDTO {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly shortCode: string,
  ) {}

  static fromRow(row: MyBranchRow): MyBranchDTO {
    return new MyBranchDTO(row.branchId, row.branchName, row.shortCode);
  }
}

/** A business the user may use, with its branches: id and name only, no role, cost or other column (ADR 0060). */
export class MyBusinessDTO {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly branches: MyBranchDTO[],
  ) {}

  /** Groups rows already ordered by business, then branch; a business with no visible branch never appears. */
  static fromRows(rows: readonly MyBranchRow[]): MyBusinessDTO[] {
    const byBusiness = new Map<string, MyBusinessDTO>();
    for (const row of rows) {
      let business = byBusiness.get(row.businessId);
      if (!business) {
        business = new MyBusinessDTO(row.businessId, row.businessName, []);
        byBusiness.set(row.businessId, business);
      }
      business.branches.push(MyBranchDTO.fromRow(row));
    }
    return [...byBusiness.values()];
  }
}
