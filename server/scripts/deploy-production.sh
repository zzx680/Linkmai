#!/usr/bin/env bash

set -euo pipefail

APP_ROOT=${LINKMAI_APP_ROOT:-/var/www/linkmai-production}
ENV_FILE=${LINKMAI_ENV_FILE:-/etc/linkmai/production.env}
RELEASE_ID=${RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)}
SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_TARGET=""
HEALTH_URL=${LINKMAI_HEALTH_URL:-http://127.0.0.1:8200/api/health}
KEEP_RELEASES=${LINKMAI_KEEP_RELEASES:-5}

if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 production 环境文件: $ENV_FILE"
  exit 1
fi

if ! command -v node >/dev/null || ! command -v npm >/dev/null || ! command -v pm2 >/dev/null; then
  echo "缺少 node、npm 或 pm2"
  exit 1
fi

if [ "$(df -Pk / | awk 'NR == 2 { print $4 }')" -lt 10485760 ]; then
  echo "系统盘可用空间低于 10GiB"
  exit 1
fi

mkdir -p "$APP_ROOT/releases" /var/log/linkmai
chown linkmai:linkmai /var/log/linkmai
chmod 750 /var/log/linkmai
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_TARGET=$(readlink -f "$CURRENT_LINK")
fi

mkdir -p "$RELEASE_DIR"
rsync -a --delete \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.env*' \
  --exclude '*.pem' \
  --exclude '*.key' \
  --exclude 'api_v3_key' \
  --exclude 'wechat_api_v3_key' \
  --exclude '*-secrets' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  "$SOURCE_ROOT/" "$RELEASE_DIR/"

if ! (
  # Bash disables errexit inside an `if ! (...)` condition. Chain every gate
  # explicitly so a failed migration cannot be hidden by a successful prune.
  cd "$RELEASE_DIR/server" &&
  npm ci &&
  npm run build &&
  DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DB_TYPE=memory npm test &&
  set -a &&
  source "$ENV_FILE" &&
  set +a &&
  node -e "require('./dist/config').validateRuntimeConfig()" &&
  npm run db:migrate &&
  npm prune --omit=dev
); then
  echo "发布门禁失败，清理候选 release"
  rm -rf "$RELEASE_DIR"
  exit 1
fi
chown -R linkmai:linkmai "$RELEASE_DIR"
find "$RELEASE_DIR" -type d -exec chmod 750 {} +
find "$RELEASE_DIR" -type f -exec chmod 640 {} +

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"

export LINKMAI_CURRENT="$CURRENT_LINK/server"
export LINKMAI_ENV_FILE="$ENV_FILE"
PM2_CONFIG="$CURRENT_LINK/server/ecosystem.production.config.js"

rollback_code() {
  if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET/server" ]; then
    ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK.next"
    mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
    export LINKMAI_CURRENT="$CURRENT_LINK/server"
    pm2 startOrReload "$CURRENT_LINK/server/ecosystem.production.config.js" --update-env
  else
    pm2 delete linkmai-production-api >/dev/null 2>&1 || true
    if [ -L "$CURRENT_LINK" ]; then
      unlink "$CURRENT_LINK"
    fi
  fi
}

if ! pm2 startOrReload "$PM2_CONFIG" --update-env; then
  echo "进程启动失败，开始代码回滚"
  rollback_code
  rm -rf "$RELEASE_DIR"
  exit 1
fi

if ! curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 2 "$HEALTH_URL" >/dev/null; then
  echo "健康检查失败，开始代码回滚"
  rollback_code
  rm -rf "$RELEASE_DIR"
  exit 1
fi

find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -rn \
  | awk -v keep="$KEEP_RELEASES" 'NR > keep { sub(/^[^ ]+ /, ""); print }' \
  | xargs -r rm -rf

pm2 save
echo "production 发布成功: $RELEASE_ID"
echo "注意：数据库迁移已执行时，代码回滚不会回滚 schema 或支付数据。"
