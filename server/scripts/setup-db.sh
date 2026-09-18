#!/bin/bash

# 灵迈数据库初始化脚本

set -e

echo "=== 灵迈数据库初始化 ==="

# 检查环境变量
if [ -z "$POSTGRES_HOST" ] || [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_DB" ]; then
  echo "错误: 请先配置环境变量"
  echo "需要: POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB"
  exit 1
fi

# 构建连接字符串
export PGPASSWORD="$POSTGRES_PASSWORD"
DB_URL="postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}"

echo "连接到数据库: $POSTGRES_HOST:${POSTGRES_PORT:-5432}/$POSTGRES_DB"

# 执行初始化 SQL
psql -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f scripts/init-db.sql

echo "✓ 数据库初始化完成"

# 验证表创建
echo ""
echo "=== 验证表结构 ==="
psql -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"

echo ""
echo "✓ 数据库设置完成"
