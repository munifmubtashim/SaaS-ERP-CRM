import { AppError } from '@erp/shared';
import { LoginUserDTO } from '../dto/AuthDTO.js';
import type { TxClient } from '../config/tenantScope.js';
import { UnscopedQuery } from './UnscopedQuery.js';

/** Lockout (ADR 0018 section 4, U-04): 5 wrong passwords lock the account for 15 minutes. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/** A new user, already validated and hashed by the Manager. Phone in E.164; at least one of email and phone. */
export interface CreateUserInput {
  email: string | null;
  phone: string | null;
  passwordHash: string;
  displayName: string;
  /** The caller's user id; NULL only when seeded (ADR 0008 section 5). */
  createdBy: string | null;
}

/**
 * Unique indexes on app_user whose violation is the caller's mistake (409, not 500). Email and phone are unique
 * across the whole system, so the same error is given whether the other user is in the caller's organization or
 * another one: the answer never says which (Munif, 22 Nov).
 */
const LOGIN_CONFLICTS = [
  {
    index: 'app_user_email_ci_key',
    field: { path: 'email', code: 'user.email_taken', message: 'This email address cannot be used.' },
  },
  {
    index: 'app_user_phone_key',
    field: { path: 'phone', code: 'user.phone_taken', message: 'This phone number cannot be used.' },
  },
] as const;

function asLoginConflict(error: unknown): never {
  if (error instanceof Error && 'code' in error && error.code === 'P2002') {
    const detail = JSON.stringify((error as { meta?: unknown }).meta ?? {});
    const match = LOGIN_CONFLICTS.find((conflict) => detail.includes(conflict.index));
    if (match) throw new AppError('CONFLICT', match.field.message, [match.field]);
  }
  throw error;
}

/** The login key app_user's SELECT policy compares with: a lower-cased email, or the E.164 phone as given. */
export function loginKey(login: string): string {
  const trimmed = login.trim();
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
}

/**
 * Auth module: database access (dal). Satisfies businessLogic contracts/IAuthQuery. Owner: Munif.
 *
 * The only Query that names app_user, role, role_permission and user_scope (ADR 0008 test 15). Those tables have
 * forced RLS scoped by organization (Munif, 22 Nov). Each method opens its own short transaction and sets only
 * what it needs, transaction-locally:
 * - findUserForLogin sets app.login_key and nothing else, so app_user's policy shows at most the one matching row
 *   and every other auth table raises 'tenant scope not set' (ADR 0018 section 4).
 * - createUser sets app.organization_id to the caller's organization.
 */
export class AuthQuery extends UnscopedQuery {
  async findUserForLogin(login: string): Promise<LoginUserDTO | null> {
    const key = loginKey(login);
    const rows = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.login_key', ${key}, true)`;
      return tx.$queryRaw<
        {
          id: string;
          organizationId: string;
          passwordHash: string;
          isActive: boolean;
          lockedUntil: Date | null;
          failedAttempts: number;
        }[]
      >`
        SELECT id::text, organization_id::text AS "organizationId", password_hash AS "passwordHash",
               is_active AS "isActive", locked_until AS "lockedUntil", failed_attempts AS "failedAttempts"
        FROM app_user
        WHERE lower(email) = ${key} OR phone = ${key}`;
    });
    const [row] = rows;
    return row ? LoginUserDTO.fromRow(row) : null;
  }

  /**
   * A wrong password (ADR 0018 section 4, step 5): one atomic UPDATE, so parallel attempts never lose a count.
   * The fifth failure sets a 15-minute lock and resets the counter. Runs inside the user's own organization.
   */
  async recordFailedLogin(user: { id: string; organizationId: string }, now: Date): Promise<void> {
    await this.inOrganization(
      user.organizationId,
      (tx) => tx.$executeRaw`
      UPDATE app_user SET
        failed_attempts = CASE WHEN failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} THEN 0 ELSE failed_attempts + 1 END,
        locked_until = CASE WHEN failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS}
                            THEN ${now}::timestamptz + make_interval(mins => ${LOCK_MINUTES})
                            ELSE locked_until END,
        updated_at = now()
      WHERE id = ${user.id}::uuid AND organization_id = ${user.organizationId}::uuid`,
    );
  }

  /** A right password (step 6): counter and lock reset; an upgraded hash stored when given (test 11). */
  async recordSuccessfulLogin(
    user: { id: string; organizationId: string },
    newHash: string | null,
  ): Promise<void> {
    await this.inOrganization(
      user.organizationId,
      (tx) => tx.$executeRaw`
      UPDATE app_user SET failed_attempts = 0, locked_until = NULL,
        password_hash = COALESCE(${newHash}, password_hash), updated_at = now()
      WHERE id = ${user.id}::uuid AND organization_id = ${user.organizationId}::uuid`,
    );
  }

  /** Creates a user in `organizationId`; a taken email or phone is a 409 that never names the other organization. */
  async createUser(organizationId: string, input: CreateUserInput): Promise<string> {
    try {
      return await this.inOrganization(organizationId, async (tx) => {
        const created = await tx.appUser.create({
          data: {
            organizationId,
            email: input.email,
            phone: input.phone,
            passwordHash: input.passwordHash,
            displayName: input.displayName,
            createdBy: input.createdBy,
          },
          select: { id: true },
        });
        return created.id;
      });
    } catch (error) {
      asLoginConflict(error);
    }
  }

  /** One short transaction with only app.organization_id set (transaction-local), for writes to one user. */
  private inOrganization<T>(organizationId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return fn(tx);
    });
  }
}
