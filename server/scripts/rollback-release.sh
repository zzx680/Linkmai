#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/release-common.sh"
acquire_release_lock
TARGET=${1:-}
if [ -z "$TARGET" ]; then
  [ -L "$APP_ROOT/previous" ] || fail "没有已记录的上一成功版本；请显式提供兼容 release 路径"
  TARGET=$(readlink -f "$APP_ROOT/previous")
fi
TARGET=$(readlink -f "$TARGET")
case "$TARGET" in "$APP_ROOT"/releases/*) ;; *) fail "回滚目标不在本环境 releases 中" ;; esac
[ -d "$TARGET/server" ] && [ -f "$TARGET/server/ecosystem.$DEPLOY_ENV.config.js" ] || fail "回滚目标无效"
[ -L "$CURRENT_LINK" ] || fail "当前 release 无效"
ORIGINAL=$(readlink -f "$CURRENT_LINK")
[ "$TARGET" != "$ORIGINAL" ] || fail "目标已是当前版本"
RESTORE_NEEDED=true
restore_on_error() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$RESTORE_NEEDED" = true ]; then
    echo "回滚未通过，尝试恢复原运行版本" >&2
    if ! { switch_release "$ORIGINAL" && reload_release && verify_release "$ORIGINAL" && pm2 save; }; then
      echo "恢复失败，须人工核实进程和数据库兼容性" >&2
    fi
    [ "$status" -ne 0 ] || status=1
  fi
  exit "$status"
}
trap restore_on_error EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
switch_release "$TARGET"
reload_release
expected_sha=""
expected_id=""
if [ -f "$TARGET/.release-info.json" ]; then
  expected_sha=$(cat "$TARGET/.release-sha")
  expected_id=$(basename "$TARGET")
fi
verify_release "$TARGET" "$expected_sha" "$expected_id"
pm2 save
ln -sfn "$ORIGINAL" "$APP_ROOT/previous.next"
mv -Tf "$APP_ROOT/previous.next" "$APP_ROOT/previous"
RESTORE_NEEDED=false
echo "已回滚代码到: $TARGET"
echo "此操作不会回滚数据库 schema、订单或支付权益。"
