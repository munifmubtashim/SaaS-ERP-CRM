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

/** What AuthController needs. Owned by api; businessLogic's AuthManager satisfies it. */
export interface IAuthManager {
  /** ADR 0018 section 4: checks the password and creates a new session; any refusal is the same 401. */
  login(login: string, password: string, userAgent: string | null): Promise<LoginOutcome>;
}
