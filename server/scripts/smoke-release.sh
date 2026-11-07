#!/usr/bin/env bash

set -euo pipefail

BASE_URL=${1:-${LINKMAI_API_URL:-}}
if [ -z "$BASE_URL" ]; then
  echo "用法: $0 https://api.example.com"
  exit 1
fi
BASE_URL=${BASE_URL%/}
SMOKE_RESPONSE_FILE=$(mktemp)
trap 'rm -f "$SMOKE_RESPONSE_FILE"' EXIT

request() {
  local expected=$1
  local method=$2
  local path=$3
  local body=${4:-}
  local status

  if [ -n "$body" ]; then
    status=$(curl --silent --show-error --max-time 15 --output "$SMOKE_RESPONSE_FILE" \
      --write-out '%{http_code}' --request "$method" \
      --header 'content-type: application/json' --data "$body" "$BASE_URL$path")
  else
    status=$(curl --silent --show-error --max-time 15 --output "$SMOKE_RESPONSE_FILE" \
      --write-out '%{http_code}' --request "$method" "$BASE_URL$path")
  fi

  if [ "$status" != "$expected" ]; then
    echo "$method $path 预期 ${expected}，实际 ${status}"
    cat "$SMOKE_RESPONSE_FILE"
    exit 1
  fi
  echo "✓ $method $path -> $status"
}

request 200 GET /api/health
node -e '
  const health = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (health.status !== "ok" || health.database !== "ok") {
    console.error("后端或数据库健康状态异常"); process.exit(1);
  }
  if ((process.env.LINKMAI_EXPECTED_SHA && health.release?.sha !== process.env.LINKMAI_EXPECTED_SHA) ||
      (process.env.LINKMAI_EXPECTED_RELEASE_ID && health.release?.id !== process.env.LINKMAI_EXPECTED_RELEASE_ID)) {
    console.error("运行进程的 release/SHA 与候选版本不匹配"); process.exit(1);
  }
  if (health.features?.paymentOrderHistory !== true || health.features?.contextualAgent !== true) {
    console.error("后端缺少订单列表或上下文对话功能");
    process.exit(1);
  }
' "$SMOKE_RESPONSE_FILE"
if [ "${LINKMAI_EXPECT_REVIEW:-false}" = true ]; then
  node -e '
    const health = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (health.features?.caseHarness !== true) {
      console.error("后端未启用案件审核流程"); process.exit(1);
    }
  ' "$SMOKE_RESPONSE_FILE"
  request 200 GET /review/
elif node -e '
  const health = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.exit(health.features?.caseHarness === true ? 0 : 1);
' "$SMOKE_RESPONSE_FILE"; then
  request 200 GET /review/
fi
if [ -n "${LINKMAI_ROOT_SITE_URL:-}" ]; then
  ROOT_SITE_URL=${LINKMAI_ROOT_SITE_URL%/}
  status=$(curl --silent --show-error --max-time 15 --output "$SMOKE_RESPONSE_FILE" --write-out '%{http_code}' "$ROOT_SITE_URL/")
  if [ "$status" != 200 ]; then
    echo "根域首页预期 200，实际 ${status}"
    cat "$SMOKE_RESPONSE_FILE"
    exit 1
  fi
  grep -q '律师登录' "$SMOKE_RESPONSE_FILE" || { echo '根域首页缺少律师登录入口' >&2; exit 1; }
  grep -q '管理员后台' "$SMOKE_RESPONSE_FILE" || { echo '根域首页缺少管理员后台入口' >&2; exit 1; }
  ROOT_API_STATUS=$(curl --silent --show-error --max-time 15 --output "$SMOKE_RESPONSE_FILE" --write-out '%{http_code}' "$ROOT_SITE_URL/api/review/queue")
  [ "$ROOT_API_STATUS" = 401 ] || { echo "根域审核 API 未认证预期 401，实际 ${ROOT_API_STATUS}" >&2; cat "$SMOKE_RESPONSE_FILE"; exit 1; }
fi

request 401 GET /api/auth/session
request 401 GET /api/payment-orders
request 401 GET /api/cases/current
request 401 POST /api/upload/image
request 400 POST /api/auth/wechat/login '{}'

echo "smoke tests 通过"
