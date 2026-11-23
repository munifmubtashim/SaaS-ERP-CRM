import { AppError } from '@erp/shared';
import type { RequestHandler } from 'express';
import { readSessionToken, type SessionCookieConfig } from '../config/sessionCookie.js';
import type { IAuthManager } from '../controllers/contracts/index.js';
import { PUBLIC_ROUTES } from '../routes/types.js';

/**
 * Who is calling (ADR 0018 section 6). For every request except PUBLIC_ROUTES: read the session cookie, and ask
 * the auth Manager, which hashes the token, finds the session through the session path (not revoked, before both
 * expiries, its user active and still in the session's organization) and extends the idle expiry. Then
 * req.auth = { userId, organizationId, sessionId }; roles come with tenantMiddleware (A6). No valid session: 401.
 */
export function createAuthMiddleware(manager: IAuthManager, cookie: SessionCookieConfig): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (PUBLIC_ROUTES.has(`${req.method} ${req.originalUrl.split('?')[0] ?? ''}`)) {
        next();
        return;
      }
      const token = readSessionToken(cookie, req.headers.cookie);
      if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
      const session = await manager.authenticate(token);
      req.auth = { ...session, roles: [], permissions: [] };
      next();
    } catch (err) {
      next(err);
    }
  };
}
