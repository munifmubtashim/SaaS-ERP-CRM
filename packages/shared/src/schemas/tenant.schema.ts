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

export const tenantScopeSchema = z.object({
  organizationId: z.uuid(),
  /** Businesses this request may read or write. Becomes SET LOCAL app.business_ids. */
  businessIds: z.array(z.uuid()),
  branchId: z.uuid().optional(),
});
