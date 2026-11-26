/** What login needs from a user row (ADR 0018 section 4). The hash never leaves businessLogic. */
export interface LoginUser {
  id: string;
  organizationId: string;
  passwordHash: string;
  isActive: boolean;
  lockedUntil: Date | null;
  failedAttempts: number;
  /** For the session body after login. */
  displayName: string;
}

/** A user, named with its organization: every write runs inside that organization's RLS scope (ADR 0050). */
export interface UserRef {
  id: string;
  organizationId: string;
}

/** A session to store (ADR 0018 section 1). Only the token's SHA-256 is stored, never the token. */
export interface NewSession {
  userId: string;
  organizationId: string;
  /** SHA-256 of the cookie token, 32 bytes. */
  tokenHash: Uint8Array;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  /** First 200 characters of the User-Agent header, or null. */
  userAgent: string | null;
}

/** A session that is usable now: not revoked, not past either expiry, its user active in its organization. */
export interface ActiveSession {
  sessionId: string;
  userId: string;
  organizationId: string;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

/** What AuthManager needs from the database. Owned by businessLogic; dal's AuthQuery satisfies it. */
/** A user's roles in one business and branch, and their active permission codes (ADR 0051). */
/** A business the user may use, with its branches (ADR 0060): id, name and short code only. */
export interface MyBusiness {
  id: string;
  name: string;
  branches: { id: string; name: string; shortCode: string }[];
}

export interface ScopeGrant {
  roles: string[];
  permissions: string[];
}

export interface IAuthQuery {
  /** Null when the business or branch is missing, inactive, another organization's, or not in the user's scopes. */
  /** The active businesses and branches the user's own active scopes cover, in their organization (ADR 0060). */
  myBusinesses(userId: string, organizationId: string): Promise<MyBusiness[]>;
  scopeFor(
    userId: string,
    organizationId: string,
    businessId: string,
    branchId: string,
  ): Promise<ScopeGrant | null>;
  /** The one read before any tenant scope (ADR 0050): by lower-cased email or E.164 phone. */
  findUserForLogin(login: string): Promise<LoginUser | null>;
  /** One atomic UPDATE: counter + 1; at 5, lock until now + 15 minutes and reset the counter. */
  recordFailedLogin(user: UserRef, now: Date): Promise<void>;
  /** Resets the counter and the lock; stores `newHash` when the old one used older settings. */
  recordSuccessfulLogin(user: UserRef, newHash: string | null): Promise<void>;
  /** Stores a new session inside the user's organization (after the password check). Returns its id. */
  createSession(session: NewSession): Promise<string>;
  /**
   * The session behind a token hash, through app.session_key (ADR 0050 section 6), or null when it is unknown,
   * revoked, past either expiry at `now`, or its user is inactive or no longer in the session's organization.
   */
  findActiveSession(tokenHash: Uint8Array, now: Date): Promise<ActiveSession | null>;
  /** Moves last_seen_at and idle_expires_at of a session that isn't revoked (absolute expiry never changes). */
  touchSession(tokenHash: Uint8Array, lastSeenAt: Date, idleExpiresAt: Date): Promise<void>;
  /** Revokes one session (logout). Returns false when it was unknown or already revoked. */
  revokeSession(tokenHash: Uint8Array, now: Date): Promise<boolean>;
  /** Revokes every session of a user (password change, deactivation). Returns how many were revoked. */
  revokeAllSessions(user: UserRef, now: Date): Promise<number>;
}
