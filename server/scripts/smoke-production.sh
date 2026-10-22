#!/usr/bin/env bash

set -euo pipefail

BASE_URL=${1:-${LINKMAI_PRODUCTION_URL:-}}
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
  if (health.features?.paymentOrderHistory !== true || health.features?.contextualAgent !== true) {
    console.error("正式后端尚未包含订单列表和上下文对话修复，请检查实际运行的 release");
    process.exit(1);
  }
' "$SMOKE_RESPONSE_FILE"
request 401 GET /api/auth/session
request 401 GET /api/payment-orders
request 401 GET /api/cases/current
request 401 POST /api/upload/image
request 400 POST /api/auth/wechat/login '{}'

echo "production smoke tests 通过"
