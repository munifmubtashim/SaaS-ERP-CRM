-- auth_session: the parts Prisma can't express (ADR 0018 section 1, ADR 0050 section 6), and the email CHECK on
-- app_user (Farhan, #102). Shipped in migration auth_session, after Prisma's statements and app_session_key().
-- Readable source: AuthSession.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

ALTER TABLE auth_session ADD CONSTRAINT auth_session_token_hash_length CHECK (octet_length(token_hash) = 32);
ALTER TABLE auth_session ADD CONSTRAINT auth_session_expiry_order
  CHECK (idle_expires_at <= absolute_expires_at AND created_at <= absolute_expires_at);

-- An email contains "@", not first. A phone is E.164 and never does, so a login key can't equal one user's email
-- and another user's phone: the login path matches at most one row (ADR 0050 sections 2 and 6).
ALTER TABLE app_user ADD CONSTRAINT app_user_email_has_at CHECK (position('@' in email) > 1);

-- TRUNCATE is refused for every role (ADR 0008, #27).
CREATE TRIGGER auth_session_no_truncate BEFORE TRUNCATE ON auth_session
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- Grants: everything erp_app has, stated here. No DELETE, no TRUNCATE: sessions expire or are revoked, and a
-- retention job, run by the owner outside requests, removes old rows later.
REVOKE ALL ON auth_session FROM erp_app;
GRANT SELECT, INSERT ON auth_session TO erp_app;
GRANT UPDATE (last_seen_at, idle_expires_at, revoked_at) ON auth_session TO erp_app;

ALTER TABLE auth_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_session FORCE ROW LEVEL SECURITY;

-- erp_app: the session path (key set: the one row with that token hash) or the organization path.
CREATE POLICY auth_session_app_select ON auth_session FOR SELECT TO erp_app
  USING (CASE WHEN (SELECT app_session_key()) IS NOT NULL
              THEN token_hash = (SELECT app_session_key())
              ELSE organization_id = (SELECT app_organization_id()) END);
-- A session is created after the password check, inside the found user's organization (A5, #45 part 2).
CREATE POLICY auth_session_app_insert ON auth_session FOR INSERT TO erp_app
  WITH CHECK (organization_id = (SELECT app_organization_id()));
CREATE POLICY auth_session_app_update ON auth_session FOR UPDATE TO erp_app
  USING (CASE WHEN (SELECT app_session_key()) IS NOT NULL
              THEN token_hash = (SELECT app_session_key())
              ELSE organization_id = (SELECT app_organization_id()) END)
  WITH CHECK (CASE WHEN (SELECT app_session_key()) IS NOT NULL
                   THEN token_hash = (SELECT app_session_key())
                   ELSE organization_id = (SELECT app_organization_id()) END);

-- The migration owner: TO CURRENT_USER, organization only, no session path, no DELETE policy (ADR 0050 section 1).
CREATE POLICY auth_session_owner_select ON auth_session FOR SELECT TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()));
CREATE POLICY auth_session_owner_insert ON auth_session FOR INSERT TO CURRENT_USER
  WITH CHECK (organization_id = (SELECT app_organization_id()));
CREATE POLICY auth_session_owner_update ON auth_session FOR UPDATE TO CURRENT_USER
  USING (organization_id = (SELECT app_organization_id()))
  WITH CHECK (organization_id = (SELECT app_organization_id()));
