#!/usr/bin/env bash
set -euo pipefail
bash "$(cd "$(dirname "$0")" && pwd)/smoke-release.sh" "${1:-${LINKMAI_STAGING_URL:-}}"
