#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/release-common.sh"
RELEASE_ID=${RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)-$$}
RELEASE_SHA=${RELEASE_SHA:-}
SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}
valid_id "$RELEASE_ID" || fail "非法 RELEASE_ID"
valid_sha "$RELEASE_SHA" || fail "RELEASE_SHA 必须是完整的 40 位 Git SHA"
[ -f "$SOURCE_ROOT/.release-source-sha" ] && [ "$(cat "$SOURCE_ROOT/.release-source-sha")" = "$RELEASE_SHA" ] || fail "源码快照 SHA 不匹配"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
PREVIOUS_TARGET=""
CANDIDATE_CREATED=false
SWITCHED=false
COMPLETED=false
for command in node npm pm2 rsync curl; do command -v "$command" >/dev/null || fail "缺少 $command"; done
acquire_release_lock
if [ "$DEPLOY_ENV" = production ]; then
  valid_id "${STAGING_RELEASE_ID:-}" || fail "缺少合法 STAGING_RELEASE_ID"
  staging_root=${LINKMAI_STAGING_ROOT:-/var/www/linkmai-staging}
  staging_target="$staging_root/releases/$STAGING_RELEASE_ID"
  [ "$(readlink -f "$staging_root/current")" = "$staging_target" ] &&
    [ -f "$staging_target/.release-ready" ] &&
    [ "$(cat "$staging_target/.release-sha")" = "$RELEASE_SHA" ] || fail "staging 当前版本或成功记录与本次 SHA 不匹配，须重新验收"
  LINKMAI_EXPECTED_SHA="$RELEASE_SHA" LINKMAI_EXPECTED_RELEASE_ID="$STAGING_RELEASE_ID" \
    bash "$SCRIPT_DIR/smoke-staging.sh" "${LINKMAI_STAGING_URL:-https://staging-api.linkmai.com}"
fi
minimum_disk=5242880
[ "$DEPLOY_ENV" != production ] || minimum_disk=10485760
[ "$(df -Pk / | awk 'NR == 2 { print $4 }')" -ge "$minimum_disk" ] || fail "系统盘空间不足"
[ "$(free -m | awk '/^Mem:/ { print $2 }')" -ge 1500 ] || fail "服务器内存低于 1.5GiB"
mkdir -p "$APP_ROOT/releases" /var/log/linkmai
chown linkmai:linkmai /var/log/linkmai
chmod 750 /var/log/linkmai
if [ -e "$CURRENT_LINK" ] && [ ! -L "$CURRENT_LINK" ]; then fail "current 不是符号链接"; fi
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_TARGET=$(readlink -f "$CURRENT_LINK")
  [ -d "$PREVIOUS_TARGET/server" ] || fail "current 指向无效 release"
fi
# Atomic reservation: never reuse an existing or running release.
mkdir "$RELEASE_DIR" || fail "release 已存在，拒绝覆盖: $RELEASE_ID"
CANDIDATE_CREATED=true
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$COMPLETED" = false ]; then
    if [ "$SWITCHED" = true ]; then
      if [ -n "$PREVIOUS_TARGET" ]; then
        echo "发布失败，恢复原 release: $PREVIOUS_TARGET" >&2
        if ! { switch_release "$PREVIOUS_TARGET" && reload_release && verify_release "$PREVIOUS_TARGET" && pm2 save; }; then
          echo "自动恢复或恢复检查失败；保留候选目录，须人工处理" >&2
          exit 1
        fi
      else
        if ! pm2 delete "$PM2_NAME"; then
          echo "首次启动清理失败；保留当前候选目录" >&2
          exit 1
        fi
        unlink "$CURRENT_LINK"
        pm2 save || true
      fi
    fi
    if [ "$CANDIDATE_CREATED" = true ] && [ "$(readlink -f "$CURRENT_LINK" || true)" != "$RELEASE_DIR" ]; then
      rm -rf -- "$RELEASE_DIR"
    fi
    [ "$status" -ne 0 ] || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
rsync -a --delete \
  --exclude '.git' --exclude '.claude' --exclude '.codex' --exclude '.agents' \
  --exclude '.env*' --exclude '*.pem' --exclude '*.key' \
  --exclude 'api_v3_key' --exclude 'wechat_api_v3_key' --exclude '*-secrets' \
  --exclude 'node_modules' --exclude 'dist' --exclude 'dist-staging' --exclude 'dist-h5' \
  "$SOURCE_ROOT/" "$RELEASE_DIR/"
printf '%s\n' "$RELEASE_SHA" > "$RELEASE_DIR/.release-sha"
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({id: process.argv[2], sha: process.argv[3]}))' \
  "$RELEASE_DIR/.release-info.json" "$RELEASE_ID" "$RELEASE_SHA"
# Outside an if/! condition, errexit stops every failed build/migration gate.
(
  set -euo pipefail
  cd "$RELEASE_DIR/server"
  npm ci
  npm run build
  DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DB_TYPE=memory npm test
  set -a
  source "$ENV_FILE"
  set +a
  [ "${NODE_ENV:-}" = "$DEPLOY_ENV" ] || fail "NODE_ENV 与目标环境不匹配"
  [ "${PORT:-}" = "$DEFAULT_PORT" ] || fail "PORT 与目标环境不匹配"
  [ "${HOST:-}" = 127.0.0.1 ] || fail "HOST 必须为 127.0.0.1"
  DOTENV_CONFIG_PATH=/dev/null node -e "require('./dist/config').validateRuntimeConfig()"
  npm run db:migrate
  npm prune --omit=dev
)
chown -R linkmai:linkmai "$RELEASE_DIR"
find "$RELEASE_DIR" -type d -exec chmod 750 {} +
find "$RELEASE_DIR" -type f -exec chmod 640 {} +
SWITCHED=true
switch_release "$RELEASE_DIR"
reload_release
verify_release "$RELEASE_DIR" "$RELEASE_SHA" "$RELEASE_ID"
pm2 save
if [ -n "$PREVIOUS_TARGET" ]; then
  ln -sfn "$PREVIOUS_TARGET" "$APP_ROOT/previous.next"
  mv -Tf "$APP_ROOT/previous.next" "$APP_ROOT/previous"
fi
date -u +%FT%TZ > "$RELEASE_DIR/.release-ready"
COMPLETED=true
prune_releases || echo "警告: 历史 release 清理失败；当前发布仍已通过检查" >&2
echo "$DEPLOY_ENV 发布成功: $RELEASE_ID ($RELEASE_SHA)"
echo "代码回滚不会回滚数据库 schema、订单或支付权益。"
