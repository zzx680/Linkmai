#!/bin/bash

echo "🚀 启动灵迈开发环境"

# 检查是否在项目根目录
if [ ! -d "miniprogram" ] || [ ! -d "server" ]; then
  echo "❌ 请在项目根目录运行此脚本"
  exit 1
fi

# 启动后端
echo "📡 启动后端服务..."
cd server
npm run dev &
SERVER_PID=$!

# 等待后端启动
sleep 2

# 启动前端编译
echo "📱 编译小程序..."
cd ../miniprogram
npm run dev:weapp &
FRONTEND_PID=$!

echo ""
echo "✅ 开发环境已启动"
echo ""
echo "后端: http://localhost:3000"
echo "小程序: 使用微信开发者工具打开 miniprogram 目录"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获退出信号
trap "kill $SERVER_PID $FRONTEND_PID; exit" INT TERM

wait
