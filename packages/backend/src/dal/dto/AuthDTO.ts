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
}

export class LoginUserDTO {
  private constructor(
    readonly id: string,
    readonly organizationId: string,
    readonly passwordHash: string,
    readonly isActive: boolean,
    readonly lockedUntil: Date | null,
    readonly failedAttempts: number,
  ) {}

  static fromRow(row: LoginUserRow): LoginUserDTO {
    return new LoginUserDTO(
      row.id,
      row.organizationId,
      row.passwordHash,
      row.isActive,
      row.lockedUntil,
      row.failedAttempts,
    );
  }
}
