/**
 * The session cookie (ADR 0018 section 2): HttpOnly, SameSite=Lax, Path=/, no Domain. With `secure` (always in
 * production, enforced by env.ts) it is `__Host-erp_sid` with Secure, which the browser refuses without HTTPS or
 * with a Domain; on http://localhost in development it is `erp_sid`, without the prefix and without Secure.
 */
export interface SessionCookieConfig {
  secure: boolean;
}

/** The production cookie: the default wherever a config isn't given. */
export const SECURE_SESSION_COOKIE: SessionCookieConfig = { secure: true };

export function sessionCookieName({ secure }: SessionCookieConfig): string {
  return secure ? '__Host-erp_sid' : 'erp_sid';
}

/** The Set-Cookie value for a new session: the token, until the session's absolute expiry. */
export function sessionCookie(config: SessionCookieConfig, token: string, expires: Date): string {
  const attributes = [`Path=/`, `Expires=${expires.toUTCString()}`, 'HttpOnly'];
  if (config.secure) attributes.push('Secure');
  attributes.push('SameSite=Lax');
  return [`${sessionCookieName(config)}=${token}`, ...attributes].join('; ');
}

/** The Set-Cookie value that removes the cookie (logout): empty, expired, same attributes. */
export function clearedSessionCookie(config: SessionCookieConfig): string {
  return sessionCookie(config, '', new Date(0));
}

/** The session token from a Cookie header, or null when there is none (or it is empty). Other cookies are ignored. */
export function readSessionToken(
  config: SessionCookieConfig,
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  const name = sessionCookieName(config);
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value === '' ? null : value;
    }
  }
  return null;
}
