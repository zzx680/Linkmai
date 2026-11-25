-- LinkMai RDS bootstrap for the self-hosted Supabase services.
--
-- Run once against a fresh Alibaba Cloud RDS PostgreSQL database as the RDS
-- master account (deploy/scripts/bootstrap-rds.sh does this for you):
--
--   psql "host=$RDS_HOST dbname=$RDS_DB user=$RDS_MASTER_USER sslmode=require" \
--     -v auth_admin_password="$SUPABASE_AUTH_ADMIN_PASSWORD" \
--     -v authenticator_password="$AUTHENTICATOR_PASSWORD" \
--     -f deploy/rds/bootstrap.sql
--
-- Why this shape: GoTrue creates auth.users as supabase_auth_admin, and only
-- the table owner may create the triggers backend/schema.sql adds to it. RDS
-- does not let the master grant BYPASSRLS, so the backend's service JWT uses
-- the supabase_auth_admin role: it owns the public tables, and ownership
-- bypasses RLS without FORCE ROW LEVEL SECURITY. PostgREST's authenticator is
-- a member of all four roles and switches to the JWT's role.
--
-- This script is idempotent: re-running it resets the two passwords but does
-- not touch data.

\set ON_ERROR_STOP on

\if :{?auth_admin_password}
\else
  \echo 'auth_admin_password is required (-v auth_admin_password=...)'
  \quit 1
\endif

\if :{?authenticator_password}
\else
  \echo 'authenticator_password is required (-v authenticator_password=...)'
  \quit 1
\endif

-- Supabase's three API roles. Only authenticator can log in; the others are
-- switched to from a JWT.
select 'create role anon nologin noinherit'
where not exists (select 1 from pg_roles where rolname = 'anon') \gexec
select 'create role authenticated nologin noinherit'
where not exists (select 1 from pg_roles where rolname = 'authenticated') \gexec
select 'create role service_role nologin noinherit'
where not exists (select 1 from pg_roles where rolname = 'service_role') \gexec

alter role anon with nologin noinherit;
alter role authenticated with nologin noinherit;
alter role service_role with nologin noinherit;

-- GoTrue's database role. It owns auth.users and the public schema objects.
select format(
  'create role supabase_auth_admin login password %L',
  :'auth_admin_password'
)
where not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') \gexec
alter role supabase_auth_admin with login password :'auth_admin_password';

-- PostgREST connects as authenticator, then assumes the JWT's role.
select format(
  'create role authenticator login noinherit password %L',
  :'authenticator_password'
)
where not exists (select 1 from pg_roles where rolname = 'authenticator') \gexec
alter role authenticator with login noinherit password :'authenticator_password';

grant anon, authenticated, service_role to authenticator;
grant supabase_auth_admin to authenticator;

-- The role must create tables, functions, and triggers in public, and create
-- GoTrue's auth schema. It does not own the public schema itself on RDS.
grant create, usage on schema public to supabase_auth_admin with grant option;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth authorization supabase_auth_admin;
alter schema auth owner to supabase_auth_admin;
grant all on schema auth to supabase_auth_admin;

select format(
  'grant create on database %I to supabase_auth_admin',
  current_database()
) \gexec

-- Extensions used by backend/schema.sql (trigram search and gen_random_uuid).
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
-- GoTrue's auth migrations use uuid_generate_v4(); create it while connected
-- as the RDS master so the migration role does not need extension rights.
create extension if not exists "uuid-ossp";

-- Application timestamps are stored in UTC; the app formats them for the
-- browser. Changing this later would make older rows ambiguous.
select format(
  'alter database %I set timezone to %L',
  current_database(),
  'UTC'
) \gexec

-- Hardening: API roles may use public, but only the owner may add objects.
revoke create on schema public from public;

-- Keep GoTrue's default search_path predictable when it runs migrations.
alter role supabase_auth_admin set search_path = public, auth;

\echo 'LinkMai RDS bootstrap complete.'
