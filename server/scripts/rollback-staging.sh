#!/usr/bin/env bash

set -euo pipefail

APP_ROOT=${LINKMAI_APP_ROOT:-/var/www/linkmai-staging}
CURRENT_LINK="$APP_ROOT/current"
TARGET=${1:-}

if [ -z "$TARGET" ]; then
  TARGET=$(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -rn \
    | sed -n '2p' \
    | cut -d' ' -f2-)
fi

if [ -z "$TARGET" ] || [ ! -d "$TARGET/server" ]; then
  echo "找不到可回滚 release"
  exit 1
fi

ln -sfn "$TARGET" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
export LINKMAI_CURRENT="$CURRENT_LINK/server"
export LINKMAI_ENV_FILE=${LINKMAI_ENV_FILE:-/etc/linkmai/staging.env}
pm2 startOrReload "$CURRENT_LINK/server/ecosystem.staging.config.js" --update-env
pm2 save

echo "已回滚到: $TARGET"
