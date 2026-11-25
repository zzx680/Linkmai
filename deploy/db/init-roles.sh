#!/usr/bin/env bash
# Runs once, as the postgres superuser, on a fresh Supabase Postgres volume.
# The image already created anon/authenticated/service_role/authenticator/
# supabase_auth_admin; this only replaces the two login passwords and makes
# the authenticator able to SET ROLE to the roles PostgREST needs.
set -euo pipefail

: "${SUPABASE_AUTH_ADMIN_PASSWORD:?SUPABASE_AUTH_ADMIN_PASSWORD is required}"
: "${AUTHENTICATOR_PASSWORD:?AUTHENTICATOR_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  -v auth_pw="$SUPABASE_AUTH_ADMIN_PASSWORD" \
  -v authn_pw="$AUTHENTICATOR_PASSWORD" <<'SQL'
alter role supabase_auth_admin with login password :'auth_pw';
alter role authenticator with login password :'authn_pw';
grant anon, authenticated, service_role to authenticator;
grant supabase_auth_admin to authenticator;
SQL
