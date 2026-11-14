import type { AuthContext, TenantScope } from '@erp/shared';

// Adds the request fields our middleware sets. pino-http adds req.id and req.log itself.
declare global {
  namespace Express {
    interface Request {
      /** Set by authMiddleware once auth exists (Phase 1). */
      auth?: AuthContext;
      /** Set by tenantMiddleware once tenancy exists (Phase 1). */
      tenant?: TenantScope;
    }
  }
}

export {};
