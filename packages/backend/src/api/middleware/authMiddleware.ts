import type { RequestHandler } from 'express';

/**
 * TODO(Munif, Phase 1): authenticate the request (short-lived access token + rotating refresh
 * cookie, argon2id passwords, roadmap 4.1 and 10.2) and set req.auth. Reject with UNAUTHENTICATED.
 * Placeholder: passes every request through and sets nothing. Not safe for real data.
 */
export const authMiddleware: RequestHandler = (_req, _res, next) => {
  next();
};
