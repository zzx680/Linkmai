#!/usr/bin/env bash

set -euo pipefail

APP_ROOT=${LINKMAI_APP_ROOT:-/var/www/linkmai-staging}
ENV_FILE=${LINKMAI_ENV_FILE:-/etc/linkmai/staging.env}
RELEASE_ID=${RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)}
SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_TARGET=""
HEALTH_URL=${LINKMAI_HEALTH_URL:-http://127.0.0.1:8100/api/health}
KEEP_RELEASES=${LINKMAI_KEEP_RELEASES:-3}

if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 staging 环境文件: $ENV_FILE"
  exit 1
fi

if ! command -v node >/dev/null || ! command -v npm >/dev/null || ! command -v pm2 >/dev/null; then
  echo "缺少 node、npm 或 pm2"
  exit 1
fi

if [ "$(df -Pk / | awk 'NR == 2 { print $4 }')" -lt 5242880 ]; then
  echo "系统盘可用空间低于 5GiB"
  exit 1
fi

if [ "$(free -m | awk '/^Mem:/ { print $2 }')" -lt 1500 ]; then
  echo "服务器内存低于 1.5GiB，不满足 staging 最低要求"
  exit 1
fi

if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  echo "警告: 未配置 swap，建议为 2GiB 轻量服务器增加 2–4GiB swap"
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
  --exclude '.env*' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  "$SOURCE_ROOT/" "$RELEASE_DIR/"

if ! (
  cd "$RELEASE_DIR/server"
  npm ci
  npm run build
  npm test
  set -a
  source "$ENV_FILE"
  set +a
  npm run db:migrate
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
PM2_CONFIG="$CURRENT_LINK/server/ecosystem.staging.config.js"

rollback() {
  if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET/server" ]; then
    ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK.next"
    mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
    export LINKMAI_CURRENT="$CURRENT_LINK/server"
    if [ -f "$CURRENT_LINK/server/ecosystem.staging.config.js" ]; then
      pm2 startOrReload "$CURRENT_LINK/server/ecosystem.staging.config.js" --update-env
    fi
  else
    pm2 delete linkmai-staging-api >/dev/null 2>&1 || true
    if [ -L "$CURRENT_LINK" ]; then
      unlink "$CURRENT_LINK"
    fi
  fi
}

if ! pm2 startOrReload "$PM2_CONFIG" --update-env; then
  echo "进程启动失败，开始回滚"
  rollback
  rm -rf "$RELEASE_DIR"
  exit 1
fi

if ! curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 2 "$HEALTH_URL" >/dev/null; then
  echo "健康检查失败，开始回滚"
  rollback
  rm -rf "$RELEASE_DIR"
  exit 1
fi

find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -rn \
  | awk -v keep="$KEEP_RELEASES" 'NR > keep { sub(/^[^ ]+ /, ""); print }' \
  | xargs -r rm -rf

pm2 save
echo "staging 发布成功: $RELEASE_ID"
