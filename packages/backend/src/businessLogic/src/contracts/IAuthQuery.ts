/** What login needs from a user row (ADR 0018 section 4). The hash never leaves businessLogic. */
export interface LoginUser {
  id: string;
  organizationId: string;
  passwordHash: string;
  isActive: boolean;
  lockedUntil: Date | null;
  failedAttempts: number;
}

/** A user, named with its organization: every write runs inside that organization's RLS scope (ADR 0050). */
export interface UserRef {
  id: string;
  organizationId: string;
}

/** What AuthManager needs from the database. Owned by businessLogic; dal's AuthQuery satisfies it. */
export interface IAuthQuery {
  /** The one read before any tenant scope (ADR 0050): by lower-cased email or E.164 phone. */
  findUserForLogin(login: string): Promise<LoginUser | null>;
  /** One atomic UPDATE: counter + 1; at 5, lock until now + 15 minutes and reset the counter. */
  recordFailedLogin(user: UserRef, now: Date): Promise<void>;
  /** Resets the counter and the lock; stores `newHash` when the old one used older settings. */
  recordSuccessfulLogin(user: UserRef, newHash: string | null): Promise<void>;
}
