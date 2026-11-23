-- The organization tree: the parts Prisma can't express (ADR 0008 sections 1 and 4, ADR 0009 part 1).
-- Shipped in migration organization_tree, after Prisma's CREATE TABLE statements. Readable source: the
-- OrganizationTree.int.test.ts source test fails when this file and the migration differ.
--
-- Changing it: a new migration with the changed statements, and the same edit here.

-- 1. Constraints Prisma can't model ------------------------------------------------------------------------

-- Short and uppercase: 2 to 6 characters, a letter first, then letters or digits.
ALTER TABLE branch ADD CONSTRAINT branch_short_code_format CHECK (short_code ~ '^[A-Z][A-Z0-9]{1,5}$');

-- Business names are unique per organization, case-insensitive; a deactivated business keeps its name.
CREATE UNIQUE INDEX business_organization_name_ci_key ON business (organization_id, lower(name));

-- 2. Key columns never change, for any role (ADR 0009, Farhan's point 2 on #31) ---------------------------

-- One function per table: PL/pgSQL may evaluate both sides of AND, so a shared function would read a column
-- the other table doesn't have.

CREATE FUNCTION public.business_freeze_keys() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id THEN
    RAISE EXCEPTION 'organization tree: business.organization_id and legal_entity_id cannot change after insert'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.branch_freeze_keys() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.short_code IS DISTINCT FROM OLD.short_code THEN
    RAISE EXCEPTION 'organization tree: branch.business_id and short_code cannot change after insert'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_freeze_keys BEFORE UPDATE ON business
  FOR EACH ROW EXECUTE FUNCTION public.business_freeze_keys();
CREATE TRIGGER branch_freeze_keys BEFORE UPDATE ON branch
  FOR EACH ROW EXECUTE FUNCTION public.branch_freeze_keys();

-- 3. TRUNCATE is refused for every role (ADR 0008, #27): RLS doesn't apply to it ---------------------------
-- Generic, so every later tenant table's migration reuses it with one CREATE TRIGGER line.

CREATE FUNCTION public.refuse_truncate() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE is refused on %: tenant data is never deleted', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER organization_no_truncate BEFORE TRUNCATE ON organization
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER legal_entity_no_truncate BEFORE TRUNCATE ON legal_entity
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER business_no_truncate BEFORE TRUNCATE ON business
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER branch_no_truncate BEFORE TRUNCATE ON branch
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- 4. Grants for erp_app (ADR 0009 "Grants and RLS") -------------------------------------------------------
-- 01-app-role.sh grants SELECT, INSERT, UPDATE, DELETE on every new table by default privileges; take back
-- what erp_app must not have. Nothing is deleted or truncated; the tree is created by the owner, the seed or
-- the provisioning path (part 2), never by erp_app.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON organization, legal_entity, business, branch FROM erp_app;
GRANT UPDATE (name, bin, address, logo_key, invoice_prefix, opening_hours, fiscal_year_start_month, is_active,
              version, updated_at) ON business TO erp_app;
GRANT UPDATE (name, address, opening_hours, is_active, version, updated_at) ON branch TO erp_app;

-- 5. Row-level security, enabled and forced -----------------------------------------------------------------

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
ALTER TABLE legal_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entity FORCE ROW LEVEL SECURITY;
ALTER TABLE business ENABLE ROW LEVEL SECURITY;
ALTER TABLE business FORCE ROW LEVEL SECURITY;
ALTER TABLE branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch FORCE ROW LEVEL SECURITY;

-- 5a. erp_app: TO erp_app, FOR SELECT and FOR UPDATE only, so no other role ever evaluates them.

CREATE POLICY organization_app_select ON organization FOR SELECT TO erp_app
  USING (id = (SELECT app_organization_id()));
CREATE POLICY organization_app_update ON organization FOR UPDATE TO erp_app
  USING (id = (SELECT app_organization_id())) WITH CHECK (id = (SELECT app_organization_id()));

CREATE POLICY legal_entity_app_select ON legal_entity FOR SELECT TO erp_app
  USING (organization_id = (SELECT app_organization_id()));
CREATE POLICY legal_entity_app_update ON legal_entity FOR UPDATE TO erp_app
  USING (organization_id = (SELECT app_organization_id()))
  WITH CHECK (organization_id = (SELECT app_organization_id()));

CREATE POLICY business_app_select ON business FOR SELECT TO erp_app
  USING (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY business_app_update ON business FOR UPDATE TO erp_app
  USING (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]))
  WITH CHECK (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]));

CREATE POLICY branch_app_select ON branch FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY branch_app_update ON branch FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND id = ANY ((SELECT app_branch_ids())::uuid[]));

-- 5b. The migration owner: TO CURRENT_USER (fixed to the migrating role when this runs), FOR SELECT, INSERT and
-- UPDATE with the same scope expressions. No DELETE policy, so a branch and its short_code are never freed.
--
-- These policies bind to the role that runs this migration, by name, at migration time. The seed and the test
-- fixtures must connect as that same role (MIGRATION_DATABASE_URL), or forced RLS gives them no rows and no
-- inserts. A superuser owner (dev and CI) skips RLS anyway; a hosted owner that is neither superuser nor
-- BYPASSRLS relies on these, which OrganizationTreeOwner.int.test.ts (ADR 0009 case 6) checks.

CREATE POLICY organization_owner_select ON organization FOR SELECT TO CURRENT_USER
  USING (id = (SELECT app_organization_id()));
CREATE POLICY organization_owner_insert ON organization FOR INSERT TO CURRENT_USER
  WITH CHECK (id = (SELECT app_organization_id()));
CREATE POLICY organization_owner_update ON organization FOR UPDATE TO CURRENT_USER
  USING (id = (SELECT app_organization_id())) WITH CHECK (id = (SELECT app_organization_id()));

CREATE POLICY legal_entity_owner_select ON legal_entity FOR SELECT TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()));
CREATE POLICY legal_entity_owner_insert ON legal_entity FOR INSERT TO CURRENT_USER
  WITH CHECK (organization_id = (SELECT app_organization_id()));
CREATE POLICY legal_entity_owner_update ON legal_entity FOR UPDATE TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()))
  WITH CHECK (organization_id = (SELECT app_organization_id()));

CREATE POLICY business_owner_select ON business FOR SELECT TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY business_owner_insert ON business FOR INSERT TO CURRENT_USER
  WITH CHECK (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY business_owner_update ON business FOR UPDATE TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]))
  WITH CHECK (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]));

CREATE POLICY branch_owner_select ON branch FOR SELECT TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY branch_owner_insert ON branch FOR INSERT TO CURRENT_USER
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY branch_owner_update ON branch FOR UPDATE TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND id = ANY ((SELECT app_branch_ids())::uuid[]));
