import { AppError, permissionCodeSchema, type PermissionCode, type TenantScope } from '@erp/shared';
import type { IAuthQuery, LoginUser } from './contracts/IAuthQuery.js';
import type { IClock } from './contracts/IClock.js';
import type { IPasswordHasher } from './contracts/IPasswordHasher.js';
import type { ISessionTokens } from './contracts/ISessionTokens.js';

/** Who passed the password check. */
export interface VerifiedLogin {
  userId: string;
  organizationId: string;
  displayName: string;
}

/** Session lifetimes (ADR 0018 section 3), from env.ts: idle 8 hours and absolute 7 days by default. */
export interface SessionLifetimes {
  idleMs: number;
  absoluteMs: number;
}

/** A successful login: the token goes into the cookie only; the rest makes the session body. */
export interface LoginOutcome {
  token: string;
  userId: string;
  displayName: string;
  /** When the session ends if unused (the idle expiry); the session body's expiresAt. */
  expiresAt: Date;
  /** When it ends regardless (never extended); the cookie's Expires. */
  absoluteExpiresAt: Date;
}

/** Who is calling, from a valid session (ADR 0018 section 6): what authMiddleware sets on req.auth. */
export interface AuthenticatedSession {
  userId: string;
  organizationId: string;
  sessionId: string;
}

/** The business and branch a tenant request names (X-Business-Id, X-Branch-Id). */
export interface RequestedScope {
  businessId: string;
  branchId: string;
}

/** A verified tenant scope: what tenantMiddleware sets on req.tenant, and the roles and permissions that apply. */
export interface ResolvedScope {
  tenant: TenantScope;
  roles: string[];
  permissions: PermissionCode[];
}

/** The user agent stored on a session: its first 200 characters (ADR 0018 section 1). */
const USER_AGENT_MAX = 200;
/** A request extends the idle expiry at most once every 5 minutes, so a request isn't always a write (section 1). */
const TOUCH_AFTER_MS = 5 * 60_000;

/**
 * Auth module: business rules. No Express, no SQL. Owner: Munif.
 *
 * Login (ADR 0018 section 4). Every refusal is the same 401 with the same message, whatever the reason (unknown
 * login, locked, deactivated, wrong password), and an unknown or locked login still spends one verification
 * against the dummy hash, so neither the answer nor its timing says whether the account exists (ADR 0050 (b)).
 */
export class AuthManager {
  constructor(
    protected readonly query: IAuthQuery,
    private readonly hasher: IPasswordHasher,
    private readonly clock: IClock,
    private readonly tokens: ISessionTokens,
    private readonly lifetimes: SessionLifetimes,
  ) {}

  /**
   * Steps 2 to 6: checks the password, then creates a new session (never reuses one: no session fixation) and
   * returns its token for the cookie. Only the token's hash is stored.
   */
  async login(login: string, password: string, userAgent: string | null): Promise<LoginOutcome> {
    const user = await this.verifyLogin(login, password);
    const now = this.clock.now();
    const token = this.tokens.generate();
    const absoluteExpiresAt = new Date(now.getTime() + this.lifetimes.absoluteMs);
    const expiresAt = new Date(Math.min(now.getTime() + this.lifetimes.idleMs, absoluteExpiresAt.getTime()));
    await this.query.createSession({
      userId: user.userId,
      organizationId: user.organizationId,
      tokenHash: this.tokens.hash(token),
      idleExpiresAt: expiresAt,
      absoluteExpiresAt,
      userAgent: userAgent === null ? null : userAgent.slice(0, USER_AGENT_MAX),
    });
    return { token, userId: user.userId, displayName: user.displayName, expiresAt, absoluteExpiresAt };
  }

  /**
   * authMiddleware's check on every non-public request (ADR 0018 section 6): the session must exist, not be revoked,
   * be before both expiries, and its user must be active and still in the session's organization (the Query checks
   * all of that). Activity extends the idle expiry, at most once every 5 minutes and never past the absolute one.
   */
  async authenticate(token: string): Promise<AuthenticatedSession> {
    const tokenHash = this.tokens.hash(token);
    const now = this.clock.now();
    const session = await this.query.findActiveSession(tokenHash, now);
    if (!session) throw new AppError('UNAUTHENTICATED', 'Sign in again.');
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      const idle = Math.min(now.getTime() + this.lifetimes.idleMs, session.absoluteExpiresAt.getTime());
      await this.query.touchSession(tokenHash, now, new Date(idle));
    }
    return { userId: session.userId, organizationId: session.organizationId, sessionId: session.sessionId };
  }

  /** Logout (ADR 0018 section 3): revokes the session behind the token, if there is one. */
  async logout(token: string): Promise<void> {
    await this.query.revokeSession(this.tokens.hash(token), this.clock.now());
  }

  async verifyLogin(login: string, password: string): Promise<VerifiedLogin> {
    const user = await this.query.findUserForLogin(login);
    const now = this.clock.now();
    if (!user || !user.isActive || this.isLocked(user, now)) {
      await this.hasher.verify(await this.hasher.dummyHash(), password);
      throw wrongLogin();
    }
    if (!(await this.hasher.verify(user.passwordHash, password))) {
      await this.query.recordFailedLogin(user, now);
      throw wrongLogin();
    }
    const newHash = this.hasher.needsRehash(user.passwordHash) ? await this.hasher.hash(password) : null;
    await this.query.recordSuccessfulLogin(user, newHash);
    return { userId: user.id, organizationId: user.organizationId, displayName: user.displayName };
  }

  /**
   * ADR 0051, verified rather than listed: the business and branch the request names must be the session
   * organization's, active, and covered by one of the user's active scopes. Every refusal is the same 404, so an id
   * of another business, a guessed id and an inactive one can't be told apart (ADR 0007 step 5).
   */
  async resolveScope(
    session: Pick<AuthenticatedSession, 'userId' | 'organizationId'>,
    requested: RequestedScope,
  ): Promise<ResolvedScope> {
    const grant = await this.query.scopeFor(
      session.userId,
      session.organizationId,
      requested.businessId,
      requested.branchId,
    );
    if (!grant) throw new AppError('NOT_FOUND', 'Business or branch not found.');
    return {
      tenant: {
        organizationId: session.organizationId,
        businessIds: [requested.businessId],
        branchIds: [requested.branchId],
        branchId: requested.branchId,
      },
      roles: grant.roles,
      // Only the codes this build knows: a code added in the database first grants nothing until shipped.
      permissions: grant.permissions.filter(
        (code): code is PermissionCode => permissionCodeSchema.safeParse(code).success,
      ),
    };
  }

  private isLocked(user: LoginUser, now: Date): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
  }
}

function wrongLogin(): AppError {
  return new AppError('UNAUTHENTICATED', 'Login or password is wrong.');
}
