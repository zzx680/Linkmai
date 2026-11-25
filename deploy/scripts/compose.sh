#!/usr/bin/env bash
# Run the production compose file with the production env file, regardless of
# the caller's working directory:
#
#   ./deploy/scripts/compose.sh config
#   ./deploy/scripts/compose.sh build
#   ./deploy/scripts/compose.sh up -d
#   ./deploy/scripts/compose.sh logs -f backend
#   ./deploy/scripts/compose.sh --profile workflows run --rm workflow-sync
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.prod}"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE; run: node deploy/scripts/generate-secrets.mjs" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose v2 is required." >&2
  exit 1
fi

exec docker compose \
  --project-directory "$DEPLOY_DIR" \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  "$@"
