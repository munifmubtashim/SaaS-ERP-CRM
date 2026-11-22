import { AppError } from '@erp/shared';
import type { RequestHandler } from 'express';

/**
 * CSRF guard (ADR 0018 section 2), with SameSite=Lax on the session cookie: every non-GET request must carry an
 * Origin header equal to the app's origin, or it is refused with 403 FORBIDDEN before anything else runs.
 */
export function createOriginCheck(appOrigin: string): RequestHandler {
  const expected = new URL(appOrigin).origin;
  return (req, _res, next) => {
    if (req.method === 'GET' || req.get('origin') === expected) {
      next();
      return;
    }
    next(new AppError('FORBIDDEN', 'This request must come from the app.'));
  };
}
