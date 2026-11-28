#!/usr/bin/env bash
# Frees space on the production host before a release pulls new images.
#
# 2026-11-28: the pull for tag 02f4b440 filled the 49 GiB root disk and
# Postgres aborted its checkpoint with "No space left on device", so the
# database entered a crash loop and the release failed. Old release tags and
# build cache are the bulk of that usage; images newer than 72 hours stay so
# a failed release can still roll back without pulling.
set -euo pipefail

before=$(df -Pk / | awk 'NR==2 {print $4}')
docker image prune -af --filter "until=72h" >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
after=$(df -Pk / | awk 'NR==2 {print $4}')

echo "free KiB: $before -> $after"

# The frontend image alone is ~4 GiB compressed; refuse to start a pull that
# would leave the database scrambling for a few hundred megabytes.
if [ "$after" -lt 8000000 ]; then
    echo "production host has less than 8 GiB free; refusing to pull images" >&2
    exit 1
fi
