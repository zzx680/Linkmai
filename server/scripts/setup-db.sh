#!/bin/bash

set -euo pipefail

echo "=== 灵迈数据库迁移 ==="

required=(POSTGRES_HOST POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB)
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "错误: 缺少环境变量 $name"
    exit 1
  fi
done

npm run build
npm run db:migrate
npm run db:test

echo "✓ 数据库迁移和验证完成"
