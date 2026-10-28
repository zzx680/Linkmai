#!/usr/bin/env bash
set -euo pipefail
export DEPLOY_ENV=production
bash "$(cd "$(dirname "$0")" && pwd)/rollback-release.sh" "$@"
