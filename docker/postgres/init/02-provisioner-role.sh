#!/bin/sh
# Creates or updates the provisioning role (ADR 0008 section 1): the only role that may INSERT a business or a
# branch, used only by ProvisioningQuery (ADR 0005 named exception). Least privilege: NOSUPERUSER, NOBYPASSRLS,
# owner of nothing, no default privileges. Its INSERT and SELECT on business and branch, and its own RLS
# policies, come with the organization_tree migration (A3b).
#
# Idempotent: Postgres runs it once when the volume is first created, and it is safe to run again by hand on an
# existing volume (`npm run db:provisioner-role`) or twice in CI.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v role_name="$PROVISIONER_DB_USER" -v role_password="$PROVISIONER_DB_PASSWORD" -v db_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role_name')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role_name') \gexec
-- Re-applied on every run, so an existing role is brought back to exactly these attributes.
ALTER ROLE :"role_name" WITH LOGIN PASSWORD :'role_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
-- Same time limits as the application role (ADR 0005).
ALTER ROLE :"role_name" SET statement_timeout = '5s';
ALTER ROLE :"role_name" SET idle_in_transaction_session_timeout = '15s';
GRANT CONNECT ON DATABASE :"db_name" TO :"role_name";
GRANT USAGE ON SCHEMA public TO :"role_name";
SQL
