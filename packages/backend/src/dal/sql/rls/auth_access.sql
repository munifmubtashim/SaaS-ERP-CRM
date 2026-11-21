-- The access tables: the parts Prisma can't express (ADR 0008 section 2, ADR 0009 part 3, as amended by Munif
-- on 22 Nov: forced RLS on app_user, role, role_permission and user_scope). Shipped in migration auth_access,
-- after Prisma's CREATE TABLE statements and the app_login_key() function, and before triggers/user_scope.sql.
-- Readable source: AuthAccess.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

-- 1. Constraints Prisma can't model ------------------------------------------------------------------------

-- Email is unique across the system, case-insensitive (ADR 0008 open question 1).
CREATE UNIQUE INDEX app_user_email_ci_key ON app_user (lower(email));

-- Phone is stored in one format only, E.164 ('+' then 8 to 15 digits, no spaces), and is unique across the
-- system (app_user_phone_key, Munif 22 Nov). The login form and the create-user schema normalise to it.
ALTER TABLE app_user ADD CONSTRAINT app_user_phone_e164 CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');

-- A user signs in by email or phone, so at least one is set (ADR 0018 section 4).
ALTER TABLE app_user ADD CONSTRAINT app_user_login_present CHECK (email IS NOT NULL OR phone IS NOT NULL);
ALTER TABLE app_user ADD CONSTRAINT app_user_failed_attempts_nonnegative CHECK (failed_attempts >= 0);

-- A branch scope also names its business: the composite foreign key to branch (business_id, id) is skipped by
-- PostgreSQL when business_id is null, so this CHECK closes that gap.
ALTER TABLE user_scope ADD CONSTRAINT user_scope_branch_needs_business
  CHECK (branch_id IS NULL OR business_id IS NOT NULL);

-- 2. System roles are fixed, for every role (Munif, 22 Nov) ----------------------------------------------------
-- The five system roles are created by the seed and never renamed, deactivated or recoded. Any role's code and
-- is_system never change. Custom roles (is_system = false) can be renamed and deactivated.

CREATE FUNCTION public.role_system_is_fixed() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code OR NEW.is_system IS DISTINCT FROM OLD.is_system
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'role: code, is_system and organization_id cannot change after insert'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.is_system AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    RAISE EXCEPTION 'role: a system role cannot be renamed or deactivated'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER role_system_is_fixed BEFORE UPDATE ON role
  FOR EACH ROW EXECUTE FUNCTION public.role_system_is_fixed();

-- 3. TRUNCATE is refused for every role (ADR 0008, #27) ----------------------------------------------------------

CREATE TRIGGER app_user_no_truncate BEFORE TRUNCATE ON app_user
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER role_no_truncate BEFORE TRUNCATE ON role
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER role_permission_no_truncate BEFORE TRUNCATE ON role_permission
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER user_scope_no_truncate BEFORE TRUNCATE ON user_scope
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER permission_no_truncate BEFORE TRUNCATE ON permission
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- 4. Grants for erp_app ---------------------------------------------------------------------------------------
-- 01-app-role.sh grants SELECT, INSERT, UPDATE, DELETE on every new table; take back what erp_app must not
-- have. Nothing is deleted: users, roles and scopes are deactivated.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app_user, role, permission, role_permission, user_scope FROM erp_app;

GRANT INSERT ON app_user, role, role_permission, user_scope TO erp_app;

-- Login and the admin screens change these; id, organization_id, created_at and created_by never change.
GRANT UPDATE (email, phone, password_hash, display_name, is_active, locked_until, failed_attempts,
              mfa_secret_enc, updated_at) ON app_user TO erp_app;
-- A role's code and is_system never change; a system role's name and is_active don't either (trigger above).
GRANT UPDATE (name, is_active, updated_at) ON role TO erp_app;
-- A scope is never moved to another user, role, business or branch: a new row is added and the old one
-- deactivated.
GRANT UPDATE (is_active, updated_at) ON user_scope TO erp_app;

-- permission is a global read-only catalogue, seeded by the migration owner: no RLS, SELECT only for erp_app
-- (ADR 0008 test 9).

-- 5. Row-level security, enabled and forced, scoped by organization -----------------------------------------
-- app_user has one narrower path for login (ADR 0018 section 4), which runs before any organization is known:
-- AuthQuery sets app.login_key (the normalised email or E.164 phone) in its own transaction and no tenant
-- values. Then the SELECT policy shows only the row whose lower(email) or phone equals that key: at most one row,
-- because both are unique. Without a login key, every policy needs app.organization_id and raises when it isn't
-- set, like every tenant table. Writes always need the organization.

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user FORCE ROW LEVEL SECURITY;
ALTER TABLE role ENABLE ROW LEVEL SECURITY;
ALTER TABLE role FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission FORCE ROW LEVEL SECURITY;
ALTER TABLE user_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_scope FORCE ROW LEVEL SECURITY;

-- 5a. erp_app: TO erp_app, one policy per granted command.

CREATE POLICY app_user_app_select ON app_user FOR SELECT TO erp_app
  USING (CASE WHEN (SELECT app_login_key()) IS NOT NULL
              THEN lower(email) = (SELECT app_login_key()) OR phone = (SELECT app_login_key())
              ELSE organization_id = (SELECT app_organization_id()) END);
CREATE POLICY app_user_app_insert ON app_user FOR INSERT TO erp_app
  WITH CHECK (organization_id = (SELECT app_organization_id()));
CREATE POLICY app_user_app_update ON app_user FOR UPDATE TO erp_app
  USING (organization_id = (SELECT app_organization_id()))
  WITH CHECK (organization_id = (SELECT app_organization_id()));

CREATE POLICY role_app_select ON role FOR SELECT TO erp_app
  USING (organization_id = (SELECT app_organization_id()));
CREATE POLICY role_app_insert ON role FOR INSERT TO erp_app
  WITH CHECK (organization_id = (SELECT app_organization_id()) AND NOT is_system);
CREATE POLICY role_app_update ON role FOR UPDATE TO erp_app
  USING (organization_id = (SELECT app_organization_id()))
  WITH CHECK (organization_id = (SELECT app_organization_id()));

-- erp_app can't add a permission to a system role: their mapping comes from the seed only.
CREATE POLICY role_permission_app_select ON role_permission FOR SELECT TO erp_app
  USING (EXISTS (SELECT 1 FROM role r WHERE r.id = role_id AND r.organization_id = (SELECT app_organization_id())));
CREATE POLICY role_permission_app_insert ON role_permission FOR INSERT TO erp_app
  WITH CHECK (EXISTS (SELECT 1 FROM role r
                      WHERE r.id = role_id AND r.organization_id = (SELECT app_organization_id()) AND NOT r.is_system));

CREATE POLICY user_scope_app_select ON user_scope FOR SELECT TO erp_app
  USING (EXISTS (SELECT 1 FROM app_user u
                 WHERE u.id = user_id AND u.organization_id = (SELECT app_organization_id())));
CREATE POLICY user_scope_app_insert ON user_scope FOR INSERT TO erp_app
  WITH CHECK (EXISTS (SELECT 1 FROM app_user u
                      WHERE u.id = user_id AND u.organization_id = (SELECT app_organization_id())));
CREATE POLICY user_scope_app_update ON user_scope FOR UPDATE TO erp_app
  USING (EXISTS (SELECT 1 FROM app_user u
                 WHERE u.id = user_id AND u.organization_id = (SELECT app_organization_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM app_user u
                      WHERE u.id = user_id AND u.organization_id = (SELECT app_organization_id())));

-- 5b. The migration owner: TO CURRENT_USER (bound to the migrating role when this runs), FOR SELECT, INSERT and
-- UPDATE, scoped by organization. No login-key path and no DELETE policy. The seed and test fixtures connect as
-- this same role (MIGRATION_DATABASE_URL) and set app.organization_id first (ADR 0008 section 4, ADR 0009).

CREATE POLICY app_user_owner_select ON app_user FOR SELECT TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()));
CREATE POLICY app_user_owner_insert ON app_user FOR INSERT TO CURRENT_USER
  WITH CHECK (organization_id = (SELECT app_organization_id()));
CREATE POLICY app_user_owner_update ON app_user FOR UPDATE TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()))
  WITH CHECK (organization_id = (SELECT app_organization_id()));

CREATE POLICY role_owner_select ON role FOR SELECT TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()));
CREATE POLICY role_owner_insert ON role FOR INSERT TO CURRENT_USER
  WITH CHECK (organization_id = (SELECT app_organization_id()));
CREATE POLICY role_owner_update ON role FOR UPDATE TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()))
  WITH CHECK (organization_id = (SELECT app_organization_id()));

CREATE POLICY role_permission_owner_select ON role_permission FOR SELECT TO CURRENT_USER
  USING (EXISTS (SELECT 1 FROM role r WHERE r.id = role_id AND r.organization_id = (SELECT app_organization_id())));
CREATE POLICY role_permission_owner_insert ON role_permission FOR INSERT TO CURRENT_USER
  WITH CHECK (EXISTS (SELECT 1 FROM role r WHERE r.id = role_id AND r.organization_id = (SELECT app_organization_id())));
CREATE POLICY role_permission_owner_update ON role_permission FOR UPDATE TO CURRENT_USER
  USING (EXISTS (SELECT 1 FROM role r WHERE r.id = role_id AND r.organization_id = (SELECT app_organization_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM role r WHERE r.id = role_id AND r.organization_id = (SELECT app_organization_id())));

CREATE POLICY user_scope_owner_select ON user_scope FOR SELECT TO CURRENT_USER
  USING (EXISTS (SELECT 1 FROM app_user u
                 WHERE u.id = user_id AND u.organization_id = (SELECT app_organization_id())));
CREATE POLICY user_scope_owner_insert ON user_scope FOR INSERT TO CURRENT_USER
  WITH CHECK (EXISTS (SELECT 1 FROM app_user u
                      WHERE u.id = user_id AND u.organization_id = (SELECT app_organization_id())));
CREATE POLICY user_scope_owner_update ON user_scope FOR UPDATE TO CURRENT_USER
  USING (EXISTS (SELECT 1 FROM app_user u
                 WHERE u.id = user_id AND u.organization_id = (SELECT app_organization_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM app_user u
                      WHERE u.id = user_id AND u.organization_id = (SELECT app_organization_id())));
