# 灵迈交通事故理赔助手 - 快速启动指南

本指南帮助你在 5 分钟内启动灵迈后端服务并进行基础测试。

---

## 一、环境要求

- **Node.js**: v18+ (推荐 v22)
- **npm**: v8+
- **可选**: PostgreSQL 16+ (生产环境推荐)

检查版本：
```bash
node -v   # v22.19.0
npm -v    # 10.x
```

---

## 二、快速启动（开发模式）

### 1. 安装依赖
```bash
cd /Users/charlie/灵迈/server
npm install
```

### 2. 创建环境配置
```bash
cp .env.example .env
```

编辑 `.env` 文件，**最少需要配置**：
```env
# 必需配置
JWT_SECRET=your-super-secret-key-change-this-in-production

# 数据库模式（开发环境用内存数据库）
DB_TYPE=memory

# 可选：如果要测试 AI 功能
DEEPSEEK_API_KEY=sk-xxxxxxxx
```

### 3. 启动服务
```bash
npm run dev
```

看到以下输出说明启动成功：
```
✅ 数据库连接成功
✅ 灵迈后端服务启动成功
📡 监听端口: 8000
🌍 环境: development
💾 数据库: 内存
```

### 4. 测试健康检查
新开一个终端：
```bash
curl http://localhost:8000/api/health
```

预期输出：
```json
{
  "status": "ok",
  "timestamp": "2026-09-18T01:30:00.000Z"
}
```

---

## 三、API 快速测试

### 测试脚本
复制以下内容到终端执行：

```bash
# 1. 登录获取 token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/wechat/login \
  -H "Content-Type: application/json" \
  -d '{"code":"test_user"}' | jq -r '.data.token')

echo "Token: $TOKEN"

# 2. 创建对话
CONV=$(curl -s -X POST http://localhost:8000/api/conversations/current \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "对话创建: $CONV" | jq .

# 3. 发送消息
MSG=$(curl -s -X POST http://localhost:8000/api/conversations/current/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，我想咨询交通事故"}')

echo "消息响应: $MSG" | jq .

# 4. 获取消息历史
HISTORY=$(curl -s http://localhost:8000/api/conversations/current/messages \
  -H "Authorization: Bearer $TOKEN")

echo "消息历史: $HISTORY" | jq '.data | length'
```

---

## 四、配置第三方服务（可选）

### 4.1 DeepSeek AI（智能分析和报告生成）

1. 注册账号：https://platform.deepseek.com
2. 创建 API Key
3. 添加到 `.env`：
```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 4.2 阿里云 OSS（文件存储）

1. 开通 OSS 服务：https://oss.console.aliyun.com
2. 创建 Bucket（如 `linkmai-dev`）
3. 获取 AccessKey
4. 添加到 `.env`：
```env
ALIYUN_OSS_REGION=oss-cn-shanghai
ALIYUN_OSS_BUCKET=linkmai-dev
ALIYUN_OSS_ACCESS_KEY_ID=LTAI5txxxxx
ALIYUN_OSS_ACCESS_KEY_SECRET=xxxxxx
```

### 4.3 阿里云 OCR（材料识别）

1. 开通 OCR 服务：https://ocr.console.aliyun.com
2. 获取 AccessKey
3. 添加到 `.env`：
```env
ALIYUN_OCR_ACCESS_KEY_ID=LTAI5txxxxx
ALIYUN_OCR_ACCESS_KEY_SECRET=xxxxxx
```

---

## 五、生产环境部署（PostgreSQL）

### 5.1 安装 PostgreSQL

**macOS**:
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install postgresql-16
sudo systemctl start postgresql
```

### 5.2 创建数据库
```bash
# 创建数据库用户
createuser linkmai

# 创建数据库
createdb -O linkmai linkmai

# 设置密码（可选）
psql -c "ALTER USER linkmai WITH PASSWORD 'linkmai123';"
```

### 5.3 初始化表结构
```bash
npm run db:setup
```

### 5.4 更新环境配置
编辑 `.env`：
```env
DB_TYPE=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=linkmai
POSTGRES_PASSWORD=linkmai123
POSTGRES_DB=linkmai
```

### 5.5 测试连接
```bash
npm run db:test
```

预期输出：
```
=== 数据库连接测试 ===
数据库类型: postgres

✓ PostgreSQL 连接成功
✓ 数据库版本: PostgreSQL 16.x
```

### 5.6 重启服务
```bash
npm run dev
```

看到 `💾 数据库: PostgreSQL` 说明已切换成功。

---

## 六、小程序开发测试

### 6.1 准备工作
1. 下载微信开发者工具
2. 打开项目目录：`/Users/charlie/灵迈/miniprogram`
3. 在设置中勾选 `不校验合法域名`

### 6.2 配置后端地址
编辑 `miniprogram/src/config/index.ts`：
```typescript
export default {
  apiBaseUrl: 'http://localhost:8000/api',
  // 真机测试需要内网穿透或部署到服务器
}
```

### 6.3 测试流程
1. 点击"微信登录"
2. 创建对话
3. 发送文字消息
4. 上传图片材料（需要配置 OSS）
5. 确认识别字段
6. 查看生成报告

---

## 七、常见问题

### Q1: 端口 8000 被占用
```bash
# 查找占用进程
lsof -i:8000

# 停止进程
kill -9 <PID>
```

或修改 `.env` 中的端口：
```env
PORT=8001
```

### Q2: 数据库连接失败
检查：
1. PostgreSQL 是否启动：`brew services list` (macOS)
2. 用户名密码是否正确
3. 数据库是否存在：`psql -l`

### Q3: DeepSeek API 报错
检查：
1. API Key 是否有效
2. 账户余额是否充足
3. 网络是否能访问 api.deepseek.com

### Q4: 微信登录失败
开发环境使用模拟登录，直接传任意 code 即可：
```bash
POST /api/auth/wechat/login
{"code": "any_string"}
```

生产环境需要配置真实的微信 AppID 和 Secret。

---

## 八、npm 脚本说明

```bash
npm run dev          # 开发模式（热重载）
npm run build        # 编译 TypeScript
npm start            # 生产模式启动
npm run db:test      # 测试数据库连接
npm run db:setup     # 初始化数据库表结构
```

---

## 九、项目结构

```
server/
├── src/
│   ├── index.ts              # 入口文件
│   ├── config/               # 配置文件
│   ├── db/                   # 数据库层
│   │   ├── index.ts          # 数据库工厂
│   │   ├── memory.ts         # 内存实现
│   │   └── postgres.ts       # PostgreSQL 实现
│   ├── routes/               # 路由
│   │   ├── auth.ts           # 认证
│   │   ├── conversations.ts  # 对话
│   │   ├── materials.ts      # 材料
│   │   └── reports.ts        # 报告
│   ├── services/             # 业务逻辑
│   │   ├── agent.ts          # Agent 状态机
│   │   ├── material.ts       # 材料识别
│   │   └── report.ts         # 报告生成
│   ├── middleware/           # 中间件
│   └── types/                # 类型定义
├── scripts/                  # 工具脚本
│   ├── init-db.sql           # 数据库初始化
│   ├── setup-db.sh           # 数据库设置
│   └── test-db.js            # 数据库测试
├── .env.example              # 环境变量模板
└── package.json
```

---

## 十、下一步

### 开发阶段
1. ✅ 完成快速启动
2. ⏳ 配置第三方服务
3. ⏳ 小程序联调测试
4. ⏳ 部署 PostgreSQL

### 生产阶段
5. ⏳ 监控和日志集成
6. ⏳ 报告 PDF 导出
7. ⏳ 性能优化
8. ⏳ 安全加固

---

## 十一、获取帮助

- **API 文档**: 参见 `P1_VERIFICATION.md`
- **数据库迁移**: 参见 `MIGRATION.md`
- **P2 开发计划**: 参见 `P2_PROGRESS.md`
- **问题反馈**: [GitHub Issues](https://github.com/your-org/linkmai)

---

**快速启动成功！** 🎉

现在你可以：
- 通过 curl 测试 API
- 在微信开发者工具中测试小程序
- 开始开发新功能

祝开发顺利！
