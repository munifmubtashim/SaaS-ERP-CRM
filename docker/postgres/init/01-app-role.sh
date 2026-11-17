#!/bin/sh
# Runs once, when the Postgres volume is first created.
# Creates the role the API and worker connect as. Roadmap 4.2 rule 3: the application role is
# never a superuser, never BYPASSRLS, and never the owner of tenant tables or views.
# Migrations run as POSTGRES_USER (the owner); the app runs as APP_DB_USER.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v db_name="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
-- Time limits (ADR 0005, provisional: measured in Phase 2). They apply from the next login. A route that
-- needs longer sets it for its own transaction with set_config('statement_timeout', ..., true).
ALTER ROLE :"app_user" SET statement_timeout = '5s';
ALTER ROLE :"app_user" SET idle_in_transaction_session_timeout = '15s';
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
-- Tables created later by the owner (migrations) are readable/writable by the app, never owned by it.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL
