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
