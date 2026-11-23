import { AppError } from '@erp/shared';
import { LoginUserDTO, ScopeDTO, SessionDTO, type ScopeRow, type SessionRow } from '../dto/AuthDTO.js';
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

/** A session to store. dal's own shape: businessLogic's NewSession satisfies it structurally (ADR 0004). */
export interface NewSessionInput {
  userId: string;
  organizationId: string;
  /** SHA-256 of the cookie token, 32 bytes; the token itself never reaches dal. */
  tokenHash: Uint8Array;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  userAgent: string | null;
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
 * The only Query that names app_user, role, role_permission, user_scope and auth_session (ADR 0008 test 15, ADR 0018
 * test 12). Those tables have forced RLS scoped by organization (ADR 0050). Each method opens its own short
 * transaction and sets only what it needs, transaction-locally:
 * - findActiveSession, touchSession and revokeSession set app.session_key (the token hash in hex), which shows only
 *   that session (ADR 0050 section 6); findActiveSession then sets the session's organization to read its user.
 * - createSession and revokeAllSessions set app.organization_id to the user's organization.
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
          displayName: string;
        }[]
      >`
        SELECT id::text, organization_id::text AS "organizationId", password_hash AS "passwordHash",
               is_active AS "isActive", locked_until AS "lockedUntil", failed_attempts AS "failedAttempts",
               display_name AS "displayName"
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

  /** Stores a new session inside the user's organization (ADR 0018 section 4, step 6). Returns its id. */
  async createSession(session: NewSessionInput): Promise<string> {
    return this.inOrganization(session.organizationId, async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO auth_session (token_hash, user_id, organization_id, idle_expires_at, absolute_expires_at, user_agent)
        VALUES (${Buffer.from(session.tokenHash)}, ${session.userId}::uuid, ${session.organizationId}::uuid,
                ${session.idleExpiresAt}, ${session.absoluteExpiresAt}, ${session.userAgent})
        RETURNING id::text`;
      if (!row) throw new AppError('INTERNAL_ERROR', 'The session insert returned no row.');
      return row.id;
    });
  }

  /**
   * The session behind a token hash, usable at `now` (ADR 0018 section 6): not revoked, before both expiries, and
   * its user active in the session's own organization. Read through the session path, then the organization path.
   */
  async findActiveSession(tokenHash: Uint8Array, now: Date): Promise<SessionDTO | null> {
    return this.withSessionKey(tokenHash, async (tx) => {
      const [session] = await tx.$queryRaw<SessionRow[]>`
        SELECT id::text, user_id::text AS "userId", organization_id::text AS "organizationId",
               last_seen_at AS "lastSeenAt", idle_expires_at AS "idleExpiresAt",
               absolute_expires_at AS "absoluteExpiresAt"
        FROM auth_session
        WHERE token_hash = ${Buffer.from(tokenHash)} AND revoked_at IS NULL
          AND idle_expires_at > ${now} AND absolute_expires_at > ${now}`;
      if (!session) return null;
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${session.organizationId}, true)`;
      const users = await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM app_user
        WHERE id = ${session.userId}::uuid AND organization_id = ${session.organizationId}::uuid AND is_active`;
      return users.length === 1 ? SessionDTO.fromRow(session) : null;
    });
  }

  /** Activity (ADR 0018 section 6, step 4): moves last_seen_at and the idle expiry; the absolute one never moves. */
  async touchSession(tokenHash: Uint8Array, lastSeenAt: Date, idleExpiresAt: Date): Promise<void> {
    await this.withSessionKey(
      tokenHash,
      (tx) => tx.$executeRaw`
        UPDATE auth_session SET last_seen_at = ${lastSeenAt}, idle_expires_at = ${idleExpiresAt}
        WHERE token_hash = ${Buffer.from(tokenHash)} AND revoked_at IS NULL`,
    );
  }

  /** Logout (ADR 0018 section 3): revokes the one session. False when it was unknown or already revoked. */
  async revokeSession(tokenHash: Uint8Array, now: Date): Promise<boolean> {
    const changed = await this.withSessionKey(
      tokenHash,
      (tx) => tx.$executeRaw`
        UPDATE auth_session SET revoked_at = ${now}
        WHERE token_hash = ${Buffer.from(tokenHash)} AND revoked_at IS NULL`,
    );
    return changed === 1;
  }

  /** Password change or deactivation (ADR 0018 section 3): revokes every session of the user, in its organization. */
  async revokeAllSessions(user: { id: string; organizationId: string }, now: Date): Promise<number> {
    return this.inOrganization(
      user.organizationId,
      (tx) => tx.$executeRaw`
        UPDATE auth_session SET revoked_at = ${now}
        WHERE user_id = ${user.id}::uuid AND organization_id = ${user.organizationId}::uuid AND revoked_at IS NULL`,
    );
  }

  /**
   * The roles that let a user work in one business and branch (ADR 0051, verified rather than listed). Inside the
   * session's organization, with app.business_ids and app.branch_ids set to the ids the request names, so RLS shows
   * the business only if it is this organization's and the branch only if it is that business's. Null when either
   * is missing, inactive or another organization's, or when no active scope of the user covers both: the caller
   * can't tell which.
   */
  async scopeFor(
    userId: string,
    organizationId: string,
    businessId: string,
    branchId: string,
  ): Promise<ScopeDTO | null> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT set_config('app.organization_id', ${organizationId}, true),
               set_config('app.business_ids', ${businessId}, true),
               set_config('app.branch_ids', ${branchId}, true)`;
      const place = await tx.$queryRaw<{ ok: number }[]>`
        SELECT 1 AS ok FROM branch br JOIN business bu ON bu.id = br.business_id
         WHERE br.id = ${branchId}::uuid AND bu.id = ${businessId}::uuid
           AND bu.organization_id = ${organizationId}::uuid AND bu.is_active AND br.is_active`;
      if (place.length !== 1) return null;
      const rows = await tx.$queryRaw<ScopeRow[]>`
        SELECT r.code AS role,
               coalesce(array_agg(rp.permission_code ORDER BY rp.permission_code)
                        FILTER (WHERE rp.is_active), '{}') AS permissions
          FROM user_scope us
          JOIN role r ON r.id = us.role_id AND r.is_active
          LEFT JOIN role_permission rp ON rp.role_id = r.id
         WHERE us.user_id = ${userId}::uuid AND us.is_active
           AND (us.business_id IS NULL
                OR (us.business_id = ${businessId}::uuid AND (us.branch_id IS NULL OR us.branch_id = ${branchId}::uuid)))
         GROUP BY r.code
         ORDER BY r.code`;
      return rows.length > 0 ? ScopeDTO.fromRows(rows) : null;
    });
  }

  /** One short transaction with only app.session_key set (transaction-local): the session path (ADR 0050 §6). */
  private withSessionKey<T>(tokenHash: Uint8Array, fn: (tx: TxClient) => Promise<T>): Promise<T> {
    const key = Buffer.from(tokenHash).toString('hex');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.session_key', ${key}, true)`;
      return fn(tx);
    });
  }

  /** One short transaction with only app.organization_id set (transaction-local), for writes to one user. */
  private inOrganization<T>(organizationId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return fn(tx);
    });
  }
}
