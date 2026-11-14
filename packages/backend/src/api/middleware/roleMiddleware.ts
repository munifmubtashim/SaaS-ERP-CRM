import type { RequestHandler } from 'express';

/**
 * Use per route: router.post('/:id/void', requireRole('sales.invoice.void'), controller.void).
 * TODO(Munif, Phase 1): check req.auth's permission codes for the active scope (roadmap 5.1, spec C-01,
 * U-02) and throw FORBIDDEN. Permission checks happen on the API, never only in the UI.
 * Placeholder: passes every request through.
 */
export function requireRole(..._permissions: string[]): RequestHandler {
  return (_req, _res, next) => {
    next();
  };
}
