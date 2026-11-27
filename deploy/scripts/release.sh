#!/usr/bin/env bash
# Start the stack on an image tag that was already built and pushed by CI.
#
#   ./deploy/scripts/release.sh <image-tag>
#
# This script never builds. The server pulls the tag from LINKMAI_IMAGE_REPO and
# restarts the containers, which is what keeps a 2 vCPU / 4 GiB host alive: the
# three images together need more memory to compile than the host has.
#
# The tag that was running before this call is written to deploy/.release-tag.prev
# so a failed health check can roll back with:
#
#   ./deploy/scripts/release.sh "$(cat deploy/.release-tag.prev)"
#
# Rolling back rewrites .release-tag.prev with the tag that just failed, so a
# second rollback would go forward again. Read the file before reusing it.
set -euo pipefail

TAG="${1:?usage: release.sh <image-tag>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.prod}"
TAG_FILE="$DEPLOY_DIR/.release-tag"
PREV_FILE="$DEPLOY_DIR/.release-tag.prev"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE; run: node deploy/scripts/generate-secrets.mjs" >&2
  exit 1
fi

if grep -qE '^[A-Z0-9_]+=.*CHANGE_ME' "$ENV_FILE"; then
  echo "$ENV_FILE still contains CHANGE_ME; refusing to start production" >&2
  exit 1
fi

if ! grep -qE '^LINKMAI_IMAGE_REPO=.+' "$ENV_FILE"; then
  echo "$ENV_FILE must set LINKMAI_IMAGE_REPO to the image registry, e.g. registry.cn-hangzhou.aliyuncs.com/linkmai" >&2
  exit 1
fi

CURRENT="$(sed -n 's/^LINKMAI_IMAGE_TAG=//p' "$ENV_FILE" | tail -1)"
if [[ -n "$CURRENT" && "$CURRENT" != "$TAG" ]]; then
  printf '%s\n' "$CURRENT" > "$PREV_FILE"
fi
printf '%s\n' "$TAG" > "$TAG_FILE"

if grep -qE '^LINKMAI_IMAGE_TAG=' "$ENV_FILE"; then
  sed -i.bak "s|^LINKMAI_IMAGE_TAG=.*|LINKMAI_IMAGE_TAG=$TAG|" "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
else
  printf 'LINKMAI_IMAGE_TAG=%s\n' "$TAG" >> "$ENV_FILE"
fi

echo "Releasing tag $TAG"
"$SCRIPT_DIR/compose.sh" config -q
# Only the application images carry the release tag; the third-party images
# (postgres, supabase, nginx, redis) stay on whatever is already cached.
"$SCRIPT_DIR/compose.sh" pull backend frontend word
"$SCRIPT_DIR/compose.sh" up -d --no-build
"$SCRIPT_DIR/compose.sh" ps

# Keep one host from filling its disk with superseded tags and build cache.
docker image prune -f >/dev/null 2>&1 || true
