import { z } from 'zod';
import { permissionCodeSchema } from '../utils/permissions.js';

/**
 * Who is calling, and which tenant data they may touch (roadmap 4.2). Set by authMiddleware and
 * tenantMiddleware; passed by Controllers to Managers. TODO(Munif, Phase 1): fill from the session.
 */
export const authContextSchema = z.object({
  userId: z.uuid(),
  organizationId: z.uuid(),
  /** The session the request came with (ADR 0018 section 6). */
  sessionId: z.uuid(),
  /** The roles that apply to the request's business and branch; set by tenantMiddleware, empty before it. */
  roles: z.array(z.string()),
  /** Their active permission codes (ADR 0051); empty outside a tenant route. */
  permissions: z.array(permissionCodeSchema),
});

/**
 * The business and branch a tenant route works in: X-Business-Id and X-Branch-Id, one id each, both required
 * (ADR 0051 as built: verified against the user's scopes, never listed). Not used on /health, /v1/auth/* or /v1/me/*.
 */
export const tenantHeadersSchema = z.object({
  businessId: z.uuid(),
  branchId: z.uuid(),
});

export const tenantScopeSchema = z
  .object({
    organizationId: z.uuid(),
    /**
     * Businesses this request may read or write. Becomes SET LOCAL app.business_ids. At least one: an empty
     * list would set an empty value that only the database guard catches, later (ADR 0005).
     */
    businessIds: z.array(z.uuid()).min(1),
    /**
     * Branches this request may use. Becomes SET LOCAL app.branch_ids. Always explicit, at least one: a
     * business-wide role lists every branch of the business; an unset list never means "all branches".
     */
    branchIds: z.array(z.uuid()).min(1),
    /**
     * The branch a document is written to, from X-Branch-Id (ADR 0007 step 6). Becomes SET LOCAL
     * app.branch_id. Must be one of branchIds. Required on routes marked { branch: 'required' }; the tenant
     * route wrapper enforces that, because only it knows the route's options.
     */
    branchId: z.uuid().optional(),
  })
  .refine((scope) => scope.branchId === undefined || scope.branchIds.includes(scope.branchId), {
    path: ['branchId'],
    message: 'branchId must be one of branchIds',
  });
