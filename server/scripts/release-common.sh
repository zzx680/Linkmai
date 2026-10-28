#!/usr/bin/env bash
# Shared Linux release primitives. DEPLOY_ENV is set by the wrapper.
set -euo pipefail
case "$DEPLOY_ENV" in
  staging) DEFAULT_PORT=8100; DEFAULT_KEEP=3 ;;
  production) DEFAULT_PORT=8200; DEFAULT_KEEP=5 ;;
  *) echo "不支持的部署环境" >&2; exit 1 ;;
esac
APP_ROOT=${LINKMAI_APP_ROOT:-/var/www/linkmai-$DEPLOY_ENV}
ENV_FILE=${LINKMAI_ENV_FILE:-/etc/linkmai/$DEPLOY_ENV.env}
HEALTH_URL=${LINKMAI_HEALTH_URL:-http://127.0.0.1:$DEFAULT_PORT/api/health}
CURRENT_LINK="$APP_ROOT/current"
PM2_NAME="linkmai-$DEPLOY_ENV-api"
KEEP_RELEASES=${LINKMAI_KEEP_RELEASES:-$DEFAULT_KEEP}
fail() { echo "$*" >&2; exit 1; }
valid_id() { [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ ]]; }
valid_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
[[ "$APP_ROOT" == /* && "$APP_ROOT" != / ]] || fail "APP_ROOT 必须是绝对应用目录"
[[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] && [ "$KEEP_RELEASES" -ge 2 ] || fail "至少保留两个 release"
[ -f "$ENV_FILE" ] || fail "缺少 $DEPLOY_ENV 环境文件: $ENV_FILE"
acquire_release_lock() {
  local lock=${LINKMAI_DEPLOY_LOCK:-/var/lock/linkmai-deploy.lock}
  command -v flock >/dev/null || fail "缺少 flock (util-linux)"
  exec 9>"$lock"
  flock -n 9 || fail "另一项发布或回滚正在运行，请稍后重试"
}
switch_release() {
  ln -sfn "$1" "$CURRENT_LINK.next" && mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
}
verify_release() {
  local target=$1 expected_sha=${2:-} expected_id=${3:-}
  if [ -z "$expected_sha" ] && [ -f "$target/.release-info.json" ]; then
    expected_sha=$(cat "$target/.release-sha") || return 1
    expected_id=$(basename "$target") || return 1
  fi
  curl --fail --silent --show-error --max-time 15 --retry 15 --retry-connrefused --retry-delay 2 "$HEALTH_URL" >/dev/null &&
    LINKMAI_EXPECTED_SHA="$expected_sha" LINKMAI_EXPECTED_RELEASE_ID="$expected_id" \
      bash "$target/server/scripts/smoke-$DEPLOY_ENV.sh" "${HEALTH_URL%/api/health}"
}
reload_release() {
  export LINKMAI_CURRENT="$CURRENT_LINK/server" LINKMAI_ENV_FILE="$ENV_FILE"
  # A spawned PM2 daemon must not inherit and retain our deployment lock.
  pm2 startOrReload "$CURRENT_LINK/server/ecosystem.$DEPLOY_ENV.config.js" --update-env 9>&-
}
prune_releases() {
  local current previous count=0 entry
  current=$(readlink -f "$CURRENT_LINK") || return 1
  previous=$(readlink -f "$APP_ROOT/previous" || true)
  while IFS= read -r entry; do
    [ -f "$entry/.release-ready" ] || continue
    count=$((count + 1))
    if [ "$count" -gt "$KEEP_RELEASES" ] && [ "$entry" != "$current" ] && [ "$entry" != "$previous" ]; then
      rm -rf -- "$entry" || return 1
    fi
  done < <(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
}
