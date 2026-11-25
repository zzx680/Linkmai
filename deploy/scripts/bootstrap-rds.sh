#!/usr/bin/env bash
# Create the Supabase roles and schemas in an Alibaba Cloud RDS PostgreSQL
# instance. Run once, from the ECS host, after deploy/.env.prod and
# deploy/.env.rds are filled in:
#
#   ./deploy/scripts/bootstrap-rds.sh
#
# Requires psql (postgresql-client) on the host. If it is missing, run the same
# command from the backend image instead:
#   docker run --rm -it --network host \
#     -v "$PWD/deploy:/deploy" --env-file deploy/.env.prod \
#     linkmai/mike-backend:prod bash /deploy/scripts/bootstrap-rds.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.prod}"
RDS_ENV_FILE="${RDS_ENV_FILE:-$DEPLOY_DIR/.env.rds}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE; copy env.prod.example and fill it in first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
# The RDS master password is kept out of .env.prod so application containers
# never receive it. Source the separate bootstrap file last.
if [[ -f "$RDS_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  . "$RDS_ENV_FILE"
fi
set +a

: "${RDS_HOST:?RDS_HOST is required}"
: "${RDS_DB:=linkmai}"
: "${RDS_PORT:=5432}"
: "${RDS_MASTER_USER:?copy deploy/.env.rds.example to deploy/.env.rds and fill in RDS_MASTER_USER}"
: "${RDS_MASTER_PASSWORD:?copy deploy/.env.rds.example to deploy/.env.rds and fill in RDS_MASTER_PASSWORD}"
: "${SUPABASE_AUTH_ADMIN_PASSWORD:?run deploy/scripts/generate-secrets.mjs first}"
: "${AUTHENTICATOR_PASSWORD:?run deploy/scripts/generate-secrets.mjs first}"

if [[ "$RDS_MASTER_PASSWORD" == "CHANGE_ME" ]]; then
  echo "RDS_MASTER_PASSWORD is still the template placeholder." >&2
  exit 1
fi

if [[ "$RDS_HOST" == *CHANGE_ME* ]]; then
  echo "RDS_HOST is still the template placeholder." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install postgresql-client or run this script inside the backend image (see the header)." >&2
  exit 1
fi

echo "Bootstrapping roles on ${RDS_HOST}:${RDS_PORT}/${RDS_DB} as ${RDS_MASTER_USER}..."
PGPASSWORD="$RDS_MASTER_PASSWORD" psql \
  "host=${RDS_HOST} port=${RDS_PORT} dbname=${RDS_DB} user=${RDS_MASTER_USER} sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -v auth_admin_password="$SUPABASE_AUTH_ADMIN_PASSWORD" \
  -v authenticator_password="$AUTHENTICATOR_PASSWORD" \
  -f "$DEPLOY_DIR/rds/bootstrap.sql"

echo "Done. Next: ./deploy/scripts/compose.sh up -d --build"
