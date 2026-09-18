# 数据库迁移指南

## 从内存数据库迁移到 PostgreSQL

### 1. 安装 PostgreSQL

**macOS (Homebrew)**:
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Docker**:
```bash
docker run -d \
  --name linkmai-postgres \
  -e POSTGRES_USER=linkmai \
  -e POSTGRES_PASSWORD=linkmai123 \
  -e POSTGRES_DB=linkmai \
  -p 5432:5432 \
  postgres:16-alpine
```

### 2. 创建数据库

```bash
# 本地 PostgreSQL
createdb linkmai -U postgres

# 或使用 psql
psql -U postgres -c "CREATE DATABASE linkmai;"
```

### 3. 配置环境变量

复制 `.env.example` 到 `.env`，修改数据库配置：

```bash
DB_TYPE=postgres

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=linkmai
POSTGRES_PASSWORD=linkmai123
POSTGRES_DB=linkmai
POSTGRES_SSL=false
```

### 4. 初始化数据库表

```bash
# 方法 1: 使用初始化脚本
chmod +x scripts/setup-db.sh
./scripts/setup-db.sh

# 方法 2: 手动执行 SQL
psql -U linkmai -d linkmai -f scripts/init-db.sql
```

### 5. 验证数据库连接

启动服务器，检查健康检查：

```bash
npm run dev

# 另一个终端
curl http://localhost:8000/health
```

预期输出：
```json
{
  "status": "ok",
  "timestamp": "2026-09-17T...",
  "database": "postgres"
}
```

### 6. 数据迁移（可选）

如果需要从内存数据库导出数据到 PostgreSQL：

```bash
# TODO: 实现数据导出脚本
npm run migrate:export  # 导出内存数据到 JSON
npm run migrate:import  # 导入 JSON 到 PostgreSQL
```

## 表结构说明

### users - 用户表
- `id`: 用户唯一标识
- `openid`: 微信 OpenID (唯一索引)
- `phone`, `nickname`, `avatar`: 用户信息

### cases - 案件表
- `id`: 案件唯一标识
- `user_id`: 关联用户
- `title`: 案件标题
- `accident_type`: 事故类型
- `status`: 案件状态
- `is_active`: 是否为活跃案件（每个用户同时只能有一个）

### conversations - 对话表
- `id`: 对话唯一标识
- `user_id`: 关联用户
- `case_id`: 关联案件
- `agent_state`: Agent 状态机 (JSONB)

### messages - 消息表
- `id`: 消息唯一标识
- `conversation_id`: 关联对话
- `role`: 角色 (user/assistant/system)
- `kind`: 类型 (text/image/quick_reply 等)
- `metadata`: 扩展字段 (JSONB)

### artifacts - 材料表
- `id`: 材料唯一标识
- `case_id`: 关联案件
- `type`: 材料类型（police-report, medical-record 等）
- `oss_url`: OSS 访问地址
- `oss_key`: OSS 存储路径

### extracted_fields - 提取字段表
- `id`: 字段唯一标识
- `artifact_id`: 关联材料
- `field_key`: 字段键名
- `original_value`: AI 提取的原始值
- `confirmed_value`: 用户确认后的值
- `is_confirmed`: 是否已确认

### reports - 报告表
- `id`: 报告唯一标识
- `case_id`: 关联案件
- `content`: 报告内容 (JSONB)
- `model_version`: AI 模型版本（可追溯）
- `input_snapshot`: 输入快照（用于复现）

## 性能优化建议

### 索引优化
所有外键已自动创建索引，常用查询字段已加索引：
- `users.openid` - 微信登录查询
- `cases.user_id`, `cases.is_active` - 用户案件查询
- `conversations.user_id`, `conversations.status` - 活跃对话查询
- `messages.conversation_id` - 消息历史查询

### 连接池配置
生产环境建议调整连接池大小（`src/db/postgres.ts`）：

```typescript
const pool = new Pool({
  max: 20,              // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})
```

### JSONB 查询优化
对于频繁查询的 JSONB 字段，可以添加 GIN 索引：

```sql
-- Agent 状态查询优化
CREATE INDEX idx_conversations_agent_state ON conversations USING GIN (agent_state);

-- 报告内容查询优化
CREATE INDEX idx_reports_content ON reports USING GIN (content);
```

## 故障排查

### 连接失败
```bash
# 检查 PostgreSQL 是否运行
pg_isready -h localhost -p 5432

# 检查连接权限
psql -U linkmai -d linkmai -c "SELECT 1"
```

### 表不存在
```bash
# 重新运行初始化脚本
./scripts/setup-db.sh
```

### 性能问题
```sql
-- 查看慢查询
SELECT * FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- 查看表大小
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## 备份与恢复

### 备份
```bash
# 完整备份
pg_dump -U linkmai linkmai > backup_$(date +%Y%m%d).sql

# 仅数据备份
pg_dump -U linkmai -a linkmai > data_backup_$(date +%Y%m%d).sql
```

### 恢复
```bash
# 恢复完整备份
psql -U linkmai linkmai < backup_20260917.sql

# 恢复数据
psql -U linkmai linkmai < data_backup_20260917.sql
```

## 监控指标

建议监控以下指标：
- 连接池使用率
- 查询响应时间 (P50, P95, P99)
- 死锁和长事务
- 表和索引大小增长
- Cache 命中率

可使用 Grafana + PostgreSQL Exporter 实现可视化监控。
