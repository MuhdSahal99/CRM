#!/bin/sh
# One-time cluster bootstrap, run by the Postgres superuser (ADR-0003 roles).
# Dev: the postgres container runs it on first start. A real server: run it once by hand with the same env vars.
# Migrations then run as crm_owner; the app connects as crm_app (crm_auth from T1.04).
set -eu
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" \
  -v owner_pw="$CRM_OWNER_PASSWORD" -v app_pw="$CRM_APP_PASSWORD" -v auth_pw="$CRM_AUTH_PASSWORD" <<'SQL'
CREATE ROLE crm_owner LOGIN PASSWORD :'owner_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE crm_app   LOGIN PASSWORD :'app_pw'   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE crm_auth  LOGIN PASSWORD :'auth_pw'  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE DATABASE crm OWNER crm_owner;
CREATE DATABASE crm_test OWNER crm_owner;
REVOKE ALL ON DATABASE crm, crm_test FROM PUBLIC;
GRANT CONNECT ON DATABASE crm, crm_test TO crm_app, crm_auth;

\c crm
ALTER SCHEMA public OWNER TO crm_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
\c crm_test
ALTER SCHEMA public OWNER TO crm_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
