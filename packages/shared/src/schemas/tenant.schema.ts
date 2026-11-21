import { z } from 'zod';

/**
 * Who is calling, and which tenant data they may touch (roadmap 4.2). Set by authMiddleware and
 * tenantMiddleware; passed by Controllers to Managers. TODO(Munif, Phase 1): fill from the session.
 */
export const authContextSchema = z.object({
  userId: z.uuid(),
  organizationId: z.uuid(),
  roles: z.array(z.string()),
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
