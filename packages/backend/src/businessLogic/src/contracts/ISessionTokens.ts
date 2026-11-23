/** Session tokens (ADR 0018 section 2). The cookie carries the token; the database only ever sees its hash. */
export interface ISessionTokens {
  /** A new token: 32 random bytes, base64url (43 characters). */
  generate(): string;
  /** The token's SHA-256, 32 bytes: what auth_session stores and the session path looks up. */
  hash(token: string): Uint8Array;
}
