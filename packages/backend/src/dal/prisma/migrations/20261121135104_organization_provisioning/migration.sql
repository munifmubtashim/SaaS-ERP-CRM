-- erp_provisioner on the organization tree (ADR 0008 section 1, ADR 0009 part 2). Shipped in migration
-- organization_provisioning; the OrganizationProvisioning.int.test.ts source test fails if they differ.
--
-- erp_provisioner (created by docker/postgres/init/02-provisioner-role.sh, #28) is the only role that creates a
-- business or a branch, used only by ProvisioningQuery (ADR 0010). Its transaction sets app.organization_id
-- only, never app.business_ids: a new business isn't in anyone's scope yet. erp_app's policies are TO erp_app and
-- the owner's TO CURRENT_USER, so neither is evaluated for it; only the policies below are.
--
-- The role must exist before this migration runs, under this exact name. This migration never creates it: a
-- role is cluster-wide and holds a password, so it belongs to the init script (dev, CI) or to whoever runs the
-- production database. A production role with another name means changing this migration.
--
-- Changing it: a new migration with the changed statements, and the same edit here.

-- 0. Stop early, with a clear message, if the role is missing. ---------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'erp_provisioner') THEN
    RAISE EXCEPTION 'organization_provisioning: the role erp_provisioner does not exist'
      USING HINT = 'Local: your Postgres volume predates the role (#28). Recreate it: docker compose down -v, '
                || 'then npm run docker:up (this deletes local data). Production: create erp_provisioner '
                || '(NOSUPERUSER, NOBYPASSRLS, LOGIN, owns nothing) before deploying. This migration never '
                || 'creates it.';
  END IF;
END;
$$;

-- 1. Least privilege: INSERT and SELECT (for INSERT … RETURNING) on these two tables, nothing else. -------------

GRANT SELECT, INSERT ON business, branch TO erp_provisioner;

-- 2. Its own policies: one organization, from app.organization_id ---------------------------------------------

CREATE POLICY business_provisioner_select ON business FOR SELECT TO erp_provisioner
  USING (organization_id = (SELECT app_organization_id()));
CREATE POLICY business_provisioner_insert ON business FOR INSERT TO erp_provisioner
  WITH CHECK (organization_id = (SELECT app_organization_id()));

-- A branch only under a business of its organization; a new one only under an active business, whatever the
-- Manager checked first (ADR 0010, Farhan's point 4 on #32).
CREATE POLICY branch_provisioner_select ON branch FOR SELECT TO erp_provisioner
  USING (business_id IN (SELECT id FROM business WHERE organization_id = (SELECT app_organization_id())));
CREATE POLICY branch_provisioner_insert ON branch FOR INSERT TO erp_provisioner
  WITH CHECK (business_id IN (SELECT id FROM business
                               WHERE organization_id = (SELECT app_organization_id()) AND is_active));

-- branch_is_active(branch_id) (ADR 0009 part 2): whether a branch is active, read under the caller's RLS.
-- A branch outside the caller's scope reads as NULL, which a WITH CHECK treats as refused. Each later
-- branch-scoped table adds `branch_is_active(branch_id)` to its WITH CHECK, so nothing is written to a closed
-- branch. Not SECURITY DEFINER: it must see only what the caller may see. Shipped in the
-- organization_provisioning migration; OrganizationProvisioning.int.test.ts checks the two match.
CREATE FUNCTION public.branch_is_active(branch_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT b.is_active FROM public.branch b WHERE b.id = branch_is_active.branch_id
$$;
