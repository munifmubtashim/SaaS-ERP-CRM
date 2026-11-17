-- Copied from dal/sql/rls/tenancy.sql (ADR 0005). No table or schema change.

-- RLS policy functions (ADR 0005). Shipped in migration rls_scope_functions.
--
-- runInTenantScope (dal/config/tenantScope.ts) sets app.organization_id, app.business_ids and
-- app.branch_ids with set_config(..., true) at the start of every tenant transaction. Policies read them
-- only through these functions, which RAISE when a value is missing or empty: an unscoped query must error,
-- never return every row and never quietly return none.
--
-- Use in a policy, each call wrapped in its own SELECT:
--   business_id = ANY ((SELECT app_business_ids()))
--   AND branch_id = ANY ((SELECT app_branch_ids()))   -- branch-scoped tables only
-- Wrapped in SELECT, PostgreSQL runs the function once per query (an InitPlan), not once per row.
--
-- Changing a function: add a new migration with CREATE OR REPLACE FUNCTION, and make the same edit here.
-- RlsSqlSource.int.test.ts fails when this file and the migrations define different functions.
--
-- Not SECURITY DEFINER: they run as the caller and read only the caller's own transaction settings.
-- search_path is fixed so a schema created by someone else cannot shadow current_setting.

CREATE FUNCTION app_organization_id() RETURNS uuid
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog
AS $$
DECLARE
  v text := current_setting('app.organization_id', true);
BEGIN
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'tenant scope not set: app.organization_id' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v::uuid;
END
$$;

CREATE FUNCTION app_business_ids() RETURNS uuid[]
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog
AS $$
DECLARE
  v text := current_setting('app.business_ids', true);
BEGIN
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'tenant scope not set: app.business_ids' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN string_to_array(v, ',')::uuid[];
END
$$;

CREATE FUNCTION app_branch_ids() RETURNS uuid[]
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog
AS $$
DECLARE
  v text := current_setting('app.branch_ids', true);
BEGIN
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'tenant scope not set: app.branch_ids' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN string_to_array(v, ',')::uuid[];
END
$$;
