/** A successful login, as AuthController needs it. The token goes into the cookie only, never the body. */
export interface LoginOutcome {
  token: string;
  userId: string;
  displayName: string;
  /** The idle expiry: the session body's expiresAt. */
  expiresAt: Date;
  /** The absolute expiry: the cookie's Expires. */
  absoluteExpiresAt: Date;
}

/** Who is calling, from a valid session cookie (ADR 0018 section 6). */
export interface AuthenticatedSession {
  userId: string;
  organizationId: string;
  sessionId: string;
}

/** What AuthController and authMiddleware need. Owned by api; businessLogic's AuthManager satisfies it. */
export interface IAuthManager {
  /** ADR 0018 section 4: checks the password and creates a new session; any refusal is the same 401. */
  login(login: string, password: string, userAgent: string | null): Promise<LoginOutcome>;
  /** ADR 0018 section 6: a usable session (user active, same organization) or a 401; extends the idle expiry. */
  authenticate(token: string): Promise<AuthenticatedSession>;
  /** ADR 0018 section 3: revokes the session behind the token, if any. */
  logout(token: string): Promise<void>;
}
