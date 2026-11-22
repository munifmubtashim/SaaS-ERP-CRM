-- user_scope rules a foreign key can't express (ADR 0008 section 2, test 6). Shipped in migration auth_access,
-- after rls/auth_access.sql. Readable source: AuthAccess.int.test.ts fails when this file and the migration
-- differ. One function per rule; both run as the caller (not SECURITY DEFINER, ADR 0005).

-- 1. Group scope (both columns null) is for the system Owner role only. The code alone isn't enough: erp_app can
-- create a custom role (is_system = false) coded 'owner' (Farhan, #94; ADR 0050).
CREATE FUNCTION public.user_scope_group_is_owner() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
DECLARE
  is_system_owner boolean;
BEGIN
  IF NEW.business_id IS NULL AND NEW.branch_id IS NULL THEN
    SELECT r.is_system AND r.code = 'owner' INTO is_system_owner FROM public.role r WHERE r.id = NEW.role_id;
    IF is_system_owner IS NOT TRUE THEN
      RAISE EXCEPTION 'user_scope: only the owner role can hold the whole group'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. The role, and the business when set, belong to the user's organization.
-- The business is read under the caller's forced RLS: a business outside the current scope is invisible and
-- refused the same way, and with no scope set app_business_ids() raises 'tenant scope not set'.
CREATE FUNCTION public.user_scope_same_organization() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
DECLARE
  user_org uuid;
  role_org uuid;
  business_org uuid;
BEGIN
  SELECT u.organization_id INTO user_org FROM public.app_user u WHERE u.id = NEW.user_id;
  SELECT r.organization_id INTO role_org FROM public.role r WHERE r.id = NEW.role_id;
  IF role_org IS DISTINCT FROM user_org THEN
    RAISE EXCEPTION 'user_scope: the role belongs to another organization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.business_id IS NOT NULL THEN
    SELECT b.organization_id INTO business_org FROM public.business b WHERE b.id = NEW.business_id;
    IF business_org IS DISTINCT FROM user_org THEN
      RAISE EXCEPTION 'user_scope: the business belongs to another organization or is outside the scope'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_scope_group_is_owner BEFORE INSERT OR UPDATE ON user_scope
  FOR EACH ROW EXECUTE FUNCTION public.user_scope_group_is_owner();
CREATE TRIGGER user_scope_same_organization BEFORE INSERT OR UPDATE ON user_scope
  FOR EACH ROW EXECUTE FUNCTION public.user_scope_same_organization();
