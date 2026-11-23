/*
  Warnings:

  - A unique constraint covering the columns `[id,organization_id]` on the table `app_user` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "auth_session" (
    "id" UUID NOT NULL DEFAULT uuid_v7(),
    "token_hash" BYTEA NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "user_agent" VARCHAR(200),

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_hash_key" ON "auth_session"("token_hash");

-- CreateIndex
CREATE INDEX "auth_session_user_id_idx" ON "auth_session"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_id_organization_id_key" ON "app_user"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "app_user"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
