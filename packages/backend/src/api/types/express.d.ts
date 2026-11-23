import type { AuthContext, TenantScope } from '@erp/shared';

// Adds the request fields our middleware sets. pino-http adds req.id and req.log itself.
declare global {
  namespace Express {
    interface Request {
      /** Set by authMiddleware from the session cookie (ADR 0018 section 6). */
      auth?: AuthContext;
      /** Set by tenantMiddleware once tenancy exists (Phase 1). */
      tenant?: TenantScope;
    }
  }
}

export {};
