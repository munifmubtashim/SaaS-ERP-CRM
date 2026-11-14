/**
 * Who is calling, and which tenant data they may touch (roadmap 4.2). Set by authMiddleware and
 * tenantMiddleware; passed by Controllers to Managers. Used by every layer, so it lives in shared.
 * TODO(Munif, Phase 1): fill from the session and the user's scopes.
 */
export interface AuthContext {
  userId: string;
  organizationId: string;
  roles: string[];
}

export interface TenantScope {
  organizationId: string;
  /** Businesses this request may read or write. Becomes SET LOCAL app.business_ids. */
  businessIds: string[];
  branchId?: string;
}
