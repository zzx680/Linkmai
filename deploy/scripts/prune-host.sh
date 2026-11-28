#!/usr/bin/env bash
# Frees space on the production host before a release pulls new images.
#
# 2026-11-28: the pull for tag 02f4b440 filled the 49 GiB root disk and
# Postgres aborted its checkpoint with "No space left on device", so the
# database entered a crash loop and the release failed. Old release tags and
# build cache are the bulk of that usage; images newer than 72 hours stay so
# a failed release can still roll back without pulling.
set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
current=$(cat "$DEPLOY_DIR/.release-tag" 2>/dev/null || true)
previous=$(cat "$DEPLOY_DIR/.release-tag.prev" 2>/dev/null || true)

before=$(df -Pk / | awk 'NR==2 {print $4}')
docker image prune -af --filter "until=72h" >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true

# Every release adds three images (~6 GiB) and each frontend layer is ~4 GiB.
# Keep only the running tag and the one rollback target; older tags are dead
# weight, and rmi refuses anything a container still uses.
repo=$(sed -n 's/^LINKMAI_IMAGE_REPO=//p' "$DEPLOY_DIR/.env.prod" 2>/dev/null | tail -1)
repo=${repo:-registry.linkmai.com/linkmai}

for repository in linkmai-backend linkmai-frontend linkmai-word-addin; do
    docker images --format '{{.Repository}}:{{.Tag}}' "$repo/$repository" |
        while read -r ref; do
            tag=${ref##*:}
            if [ "$tag" = "$current" ] || [ "$tag" = "$previous" ] || [ "$tag" = "<none>" ]; then
                continue
            fi
            docker rmi "$ref" >/dev/null 2>&1 || true
        done
done
after=$(df -Pk / | awk 'NR==2 {print $4}')

echo "free KiB: $before -> $after"

# The frontend image alone is ~4 GiB compressed; refuse to start a pull that
# would leave the database scrambling for a few hundred megabytes.
if [ "$after" -lt 8000000 ]; then
    echo "production host has less than 8 GiB free; refusing to pull images" >&2
    exit 1
fi
