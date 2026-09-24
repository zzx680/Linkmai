# 灵迈后端系统状态报告

**日期**: 2026-09-19  
**分支**: worktree-backend  
**状态**: ✅ P1 核心功能已完成，生产就绪待部署

---

## 系统架构概览

### 技术栈
- **运行时**: Node.js + TypeScript
- **框架**: Express 4.x
- **AI集成**: DeepSeek API (Chat + Vision)
- **云服务**: 阿里云 OSS + OCR
- **认证**: JWT
- **数据库**: 双模式支持 (Memory / PostgreSQL)

### 核心模块
```
server/src/
├── config/           # 环境配置管理
├── controllers/      # 控制器层
├── db/               # 数据库抽象层
│   ├── index.ts      # 统一接口
│   ├── memory.ts     # 内存数据库 (开发/测试)
│   └── postgres.ts   # PostgreSQL (生产)
├── middleware/       # 中间件
│   ├── auth.ts       # JWT 认证
│   └── error.ts      # 错误处理
├── routes/           # API 路由
├── services/         # 业务逻辑服务
└── index.ts          # 服务入口
```

---

## 已实现功能

### ✅ 认证与授权
- **微信小程序登录**: `/api/auth/login`
- **JWT Token 颁发与验证**
- **全局认证中间件**: 所有保护接口强制认证
- **用户归属验证**: 案件、报告等资源校验用户所有权

**安全加固**（2026-09-18）:
- ✅ 移除认证绕过漏洞
- ✅ 报告接口增加用户归属校验
- ✅ 所有敏感操作需 JWT 认证

### ✅ 案件管理
- 创建案件: `POST /api/cases`
- 获取当前活跃案件: `GET /api/cases/current`
- 更新案件信息: `PUT /api/cases/current`
- 每个用户同时只能有一个活跃案件

### ✅ Agent 对话系统
- **多轮对话管理**: `/api/conversations`
- **状态机驱动**: collecting → confirming → analyzing → ready
- **结构化信息收集**: 必需字段引导 + 快捷回复
- **材料识别自动化**: 图片上传 → OCR → AI 提取 → 用户确认

**对话流程**:
```
用户上传图片 → 阿里云 OCR 识别文字 
             → DeepSeek Vision 提取结构化字段 
             → 返回确认消息 + 快捷回复按钮
             → 用户确认后进入下一阶段
```

### ✅ 材料处理
- **文件上传**: OSS 直传 (图片/视频)
- **OCR 识别**:
  - 通用文字识别
  - 交警认定书专项识别
  - 身份证识别
  - 营业执照识别
- **AI 字段提取**: DeepSeek Vision 结构化提取
- **批量处理**: 支持多张图片并行处理

### ✅ 报告生成
- **事故分析报告**: `POST /api/reports/generate`
- **报告查询**: `GET /api/reports/:caseId`
- **导出接口**: `POST /api/reports/:caseId/export` (占位)

**报告内容**:
- 事故经过分析
- 责任认定
- 赔偿估算
- 法律建议
- 处理建议

### ✅ 错误处理
- 全局错误中间件
- 业务异常类 `BusinessError`
- 统一响应格式
- 404 处理

---

## 数据库架构

### 当前状态
- **开发环境**: 内存数据库 (MemoryDB)
- **生产环境**: PostgreSQL 支持已就绪

### 数据模型
```typescript
User          // 用户表
├─ Case       // 案件表 (1:N)
   ├─ Conversation    // 对话表 (1:1)
   │  └─ Message      // 消息表 (1:N)
   ├─ Artifact        // 材料表 (1:N)
   │  └─ ExtractedField  // 提取字段表 (1:N)
   └─ Report          // 报告表 (1:1)
```

### PostgreSQL 迁移
- ✅ Schema 定义完整
- ✅ 数据库抽象层统一接口
- ✅ 初始化脚本: `scripts/setup-db.sh`
- 📄 迁移文档: `MIGRATION.md`

**切换方式**:
```bash
# .env 修改
DB_TYPE=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=linkmai
POSTGRES_PASSWORD=***
POSTGRES_DB=linkmai
```

---

## API 端点总览

### 公开接口
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/auth/login` | POST | 微信登录 |

### 认证保护接口
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/cases/current` | GET | 获取当前案件 |
| `/api/cases` | POST | 创建案件 |
| `/api/conversations/current/messages` | GET | 获取对话历史 |
| `/api/conversations/current/messages` | POST | 发送消息 |
| `/api/materials/process` | POST | 处理单个材料 |
| `/api/materials/batch-process` | POST | 批量处理材料 |
| `/api/reports/generate` | POST | 生成报告 |
| `/api/reports/:caseId` | GET | 查询报告 |
| `/api/reports/:caseId/export` | POST | 导出报告 |
| `/api/upload/image` | POST | 上传图片 |
| `/api/upload/video` | POST | 上传视频 |

完整 API 文档: `API_SUMMARY.md`

---

## 测试与验证

### ✅ 构建验证
```bash
npm run build  # ✅ TypeScript 编译通过
```

### ✅ 启动验证
```bash
npm run dev
# ✅ 数据库连接成功
# ✅ 灵迈后端服务启动成功
# 📡 监听端口: 8000
# 💾 数据库: memory
```

### ✅ 健康检查
```bash
curl http://localhost:8000/api/health
# {"status":"ok","database":"ok","timestamp":"2026-09-19T..."}
```

### 待测试项
- [ ] 端到端流程测试 (登录 → 对话 → 材料识别 → 报告生成)
- [ ] 微信小程序真机测试
- [ ] PostgreSQL 模式验证
- [ ] 并发压力测试
- [ ] 错误场景测试 (OCR 失败、AI 超时等)

---

## 环境配置清单

### 必需环境变量
```bash
# 服务配置
PORT=8000
NODE_ENV=production

# 数据库
DB_TYPE=memory  # 或 postgres
# PostgreSQL 配置 (生产环境)
POSTGRES_HOST=
POSTGRES_PORT=5432
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=linkmai

# 微信小程序
WECHAT_APP_ID=
WECHAT_APP_SECRET=

# JWT
JWT_SECRET=  # 生产环境必须使用强随机密钥

# 阿里云 OSS
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
ALIYUN_OSS_BUCKET=

# 阿里云 OCR
ALIYUN_OCR_ACCESS_KEY_ID=
ALIYUN_OCR_ACCESS_KEY_SECRET=
ALIYUN_OCR_ENDPOINT=ocr.cn-shanghai.aliyuncs.com

# DeepSeek AI
DEEPSEEK_API_KEY=
DEEPSEEK_API_BASE=https://api.deepseek.com
```

### 配置文件
- ✅ `.env.example` - 环境变量模板
- ⚠️ `.env` - 实际配置 (需创建，不提交到 Git)

---

## 成本估算

### DeepSeek API
- 模型: `deepseek-flash`
- 每案例约 3-5 张图片
- 预估成本: ¥0.013/案例
- 比 Claude Vision 便宜 ~50 倍

### 阿里云服务
- OSS: 按流量计费
- OCR: 按调用次数计费 (前 1000 次免费)

---

## 近期修复记录

### 2026-09-18 安全加固 (commit: 0e16288)
1. **数据库配置统一**: 改用 `DB_TYPE` 和 `POSTGRES_*` 环境变量
2. **认证绕过修复**: `/api/reports/*` 强制 JWT 认证
3. **报告接口完善**: 增加用户归属校验和数据库集成
4. **OCR 服务修正**: 使用独立凭证，修正身份证识别 API
5. **内存数据库补齐**: 新增 `findCaseById`、报告存取方法

---

## 下一步计划

### P2 - 生产部署准备
- [ ] PostgreSQL 生产部署
- [ ] 环境变量加密管理 (AWS Secrets Manager / K8s Secrets)
- [ ] 日志系统 (Winston + CloudWatch)
- [ ] 监控告警 (Prometheus + Grafana)
- [ ] 性能优化 (缓存策略、连接池调优)

### P3 - 功能增强
- [ ] 律师服务对接
- [ ] 报告导出 (PDF 生成)
- [ ] 语音识别 (ASR 集成)
- [ ] 多语言支持
- [ ] 案例库检索

### P4 - 企业级功能
- [ ] 数据备份与恢复
- [ ] 审计日志
- [ ] 合规报告
- [ ] 多租户支持

---

## 部署指南

### 开发环境
```bash
cd server
npm install
cp .env.example .env
# 编辑 .env 填入配置
npm run dev
```

### 生产环境
```bash
# 构建
npm run build

# 使用 PM2 运行
pm2 start dist/index.js --name linkmai-server

# 或使用 Docker
docker build -t linkmai-server .
docker run -d -p 8000:8000 --env-file .env linkmai-server
```

---

## 联系信息

**项目负责人**: Charlie  
**技术支持**: [GitHub Issues](https://github.com/your-org/linkmai/issues)

---

**最后更新**: 2026-09-19  
**版本**: v1.0.0-beta
