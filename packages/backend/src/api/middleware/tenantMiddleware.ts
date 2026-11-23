import { AppError, tenantHeadersSchema } from '@erp/shared';
import type { RequestHandler } from 'express';
import type { IAuthManager } from '../controllers/contracts/index.js';

/**
 * The tenant scope of a request (ADR 0051, as built). Mounted on tenant module routers only, after authMiddleware,
 * so /health, /v1/auth/* and /v1/me/* never need it. Reads X-Business-Id and X-Branch-Id (one id each, both
 * required; 400 tenant.headers otherwise), asks the auth Manager to verify them against the user's scopes (the same
 * 404 for anything not allowed or not there), then sets req.tenant and the roles and permissions that apply.
 * Opens no transaction: every refusal here happens before one (test 7).
 */
export function createTenantMiddleware(auth: IAuthManager): RequestHandler {
  return async (req, _res, next) => {
    try {
      const session = req.auth;
      if (!session) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
      const headers = tenantHeadersSchema.safeParse({
        businessId: req.get('X-Business-Id'),
        branchId: req.get('X-Branch-Id'),
      });
      if (!headers.success) {
        throw new AppError('VALIDATION_FAILED', 'Choose a business and a branch.', [
          {
            path: 'X-Business-Id',
            code: 'tenant.headers',
            message: 'Send X-Business-Id and X-Branch-Id, one id each.',
          },
        ]);
      }
      const scope = await auth.resolveScope(session, headers.data);
      req.tenant = scope.tenant;
      req.auth = { ...session, roles: scope.roles, permissions: scope.permissions };
      next();
    } catch (err) {
      next(err);
    }
  };
}
