import type { RequestHandler } from 'express';

/**
 * TODO(Munif, Phase 1): resolve req.tenant (organization and allowed business ids) from req.auth and
 * the requested business/branch; reject ids the user has no scope for (roadmap 4.2).
 *
 * Layer note: the tenancy rule needs every request in ONE transaction that starts with
 * SET LOCAL app.organization_id / app.business_ids. This middleware cannot open it (api never
 * touches dal). Managers will run their Queries through a dal helper (withTenantScope) using
 * req.tenant, passed in by the Controller. Decide the details in a Phase 1 ADR before any tenant table.
 *
 * Placeholder: passes every request through and sets nothing.
 */
export const tenantMiddleware: RequestHandler = (_req, _res, next) => {
  next();
};
