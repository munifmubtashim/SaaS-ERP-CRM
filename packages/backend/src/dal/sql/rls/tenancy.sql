-- RLS policy functions (ADR 0005). Shipped in migration rls_scope_functions.
--
-- runInTenantScope (dal/config/tenantScope.ts) sets app.organization_id, app.business_ids and
-- app.branch_ids with set_config(..., true) at the start of every tenant transaction. Policies read them
-- only through these functions, which RAISE when a value is missing or empty: an unscoped query must error,
-- never return every row and never quietly return none.
--
-- Use in a policy, each call wrapped in its own SELECT and cast back to an array:
--   business_id = ANY ((SELECT app_business_ids())::uuid[])
--   AND branch_id = ANY ((SELECT app_branch_ids())::uuid[])   -- branch-scoped tables only
-- Wrapped in SELECT, PostgreSQL runs the function once per query (an InitPlan), not once per row.
-- The ::uuid[] is required: without it, ANY ((SELECT ...)) is read as "any row of a subquery" and fails
-- with "operator does not exist: uuid = uuid[]". RlsParallel.int.test.ts runs these two lines.
--
-- Changing a function: add a new migration with CREATE OR REPLACE FUNCTION, and make the same edit here.
-- RlsSqlSource.int.test.ts fails when this file and the migrations define different functions.
--
-- Not SECURITY DEFINER: they run as the caller and read only the caller's own transaction settings.
-- search_path is fixed so a schema created by someone else cannot shadow current_setting.
-- PARALLEL SAFE: the transaction's settings reach parallel workers (proved by RlsParallel.int.test.ts),
-- so queries under RLS can still use parallel plans.

CREATE FUNCTION public.app_organization_id() RETURNS uuid
  LANGUAGE plpgsql STABLE PARALLEL SAFE
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

CREATE FUNCTION public.app_business_ids() RETURNS uuid[]
  LANGUAGE plpgsql STABLE PARALLEL SAFE
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

CREATE FUNCTION public.app_branch_ids() RETURNS uuid[]
  LANGUAGE plpgsql STABLE PARALLEL SAFE
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

-- The login lookup's key (ADR 0018 section 4; Munif, 22 Nov). Shipped in migration auth_access. Unlike the three
-- functions above it returns NULL when unset instead of raising: only the user table's SELECT policy reads it, to
-- choose between the login path (key set: the one row whose lower(email) or phone equals it) and the normal
-- organization check (key unset: app_organization_id() raises as usual). AuthQuery sets it, with set_config(...,
-- true), only in its own login transaction.
CREATE FUNCTION public.app_login_key() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  SET search_path = pg_catalog
AS $$
  SELECT nullif(current_setting('app.login_key', true), '')
$$;

-- The session lookup's key (ADR 0050 section 6; Munif, 22 Nov). Shipped in the sessions migration. Like
-- app_login_key() it returns NULL when unset instead of raising, so the session table's policies can choose between
-- the session path (key set: the one row whose token_hash equals it) and the organization check. The value is the
-- hex SHA-256 of the cookie token; a value that isn't hex raises. AuthQuery sets it, with set_config(..., true),
-- only in its own session-lookup transaction.
CREATE FUNCTION public.app_session_key() RETURNS bytea
  LANGUAGE sql STABLE PARALLEL SAFE
  SET search_path = pg_catalog
AS $$
  SELECT decode(nullif(current_setting('app.session_key', true), ''), 'hex')
$$;
