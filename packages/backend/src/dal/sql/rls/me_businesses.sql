-- GET /v1/me/businesses (ADR 0060): the "me" path, so a signed-in user can list the businesses and branches their
-- own user_scope rows cover, before any business is chosen. Shipped in migration me_businesses; MyBusinesses.int.test.ts
-- fails when this file and the migration differ.
--
-- Additive only: two SELECT policies for erp_app. Nothing else changes: the existing policies, the grants and
-- FORCE ROW LEVEL SECURITY on business and branch stay as they are. Not SECURITY DEFINER; erp_app keeps NOBYPASSRLS.
--
-- The path is open only when AuthQuery.myBusinesses sets, with set_config(..., true) in its own transaction:
--   app.organization_id = the session's organization,
--   app.me_user_id      = the session's user,
--   app.business_ids    = app.branch_ids = the nil UUID '00000000-0000-0000-0000-000000000000'.
-- The nil marker is needed because the existing policies call app_business_ids() and app_branch_ids(), which raise
-- when unset, and permissive policies are OR-ed; with the marker they match no row. No business or branch has the
-- nil id (uuid_v7), and a request naming it gets the tenant middleware's 404 before any transaction. A normal tenant
-- transaction sets real ids, so app_me_user_id() is NULL and these policies add nothing to it.

-- app_me_user_id() (the "me" user, or NULL unless the whole marker is set) is in rls/tenancy.sql with the other
-- app_* functions; it ships in this migration, before these policies.

-- A business of the caller's organization that one of the user's active scopes (with an active role) covers: a
-- group scope (business_id NULL) covers every business of the organization; any other scope covers its business.
CREATE POLICY business_app_me_select ON business FOR SELECT TO erp_app
  USING (
    (SELECT app_me_user_id()) IS NOT NULL
    AND organization_id = (SELECT app_organization_id())
    AND EXISTS (
      SELECT 1
        FROM user_scope us
        JOIN app_user u ON u.id = us.user_id AND u.is_active
        JOIN role r ON r.id = us.role_id AND r.is_active
       WHERE us.user_id = (SELECT app_me_user_id()) AND us.is_active
         AND (us.business_id IS NULL OR us.business_id = business.id)
    )
  );

-- A branch of such a business that the scope covers: a group or whole-business scope (branch_id NULL) covers every
-- branch of the business; a branch scope covers only its own branch.
CREATE POLICY branch_app_me_select ON branch FOR SELECT TO erp_app
  USING (
    (SELECT app_me_user_id()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM business b
       WHERE b.id = branch.business_id AND b.organization_id = (SELECT app_organization_id())
    )
    AND EXISTS (
      SELECT 1
        FROM user_scope us
        JOIN app_user u ON u.id = us.user_id AND u.is_active
        JOIN role r ON r.id = us.role_id AND r.is_active
       WHERE us.user_id = (SELECT app_me_user_id()) AND us.is_active
         AND (us.business_id IS NULL
              OR (us.business_id = branch.business_id AND (us.branch_id IS NULL OR us.branch_id = branch.id)))
    )
  );
