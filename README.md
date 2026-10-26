# 灵迈 — 交通事故处理助手

面向中国大陆交通事故受伤者及家属的微信小程序。当前流程：微信登录 → 创建案件 → 描述事故和上传材料 → 识别并确认材料字段 → 按案件一次性付费 → 生成报告 → 补充材料后重新分析。

## 工程入口

```text
miniprogram/                 # 当前客户端：Taro 4 + React 18 + Zustand
  src/pages/case/            # 首页、当前案件和支付入口
  src/pages/agent/           # 处理流程、对话和材料上传
  src/pages/profile/         # 我的
  src/pages/materials/       # 材料识别结果确认
  src/pages/report/          # 案件分析报告
  src/pages/payments/        # 付费权益与支付恢复
  src/styles/               # 统一蓝色设计变量与样式
  tests/                    # 前端逻辑与页面渲染回归测试
server/                     # Express + TypeScript（CommonJS）
  src/routes/               # 登录、案件、对话、材料、报告、支付、上传
  src/services/             # AI、OCR、OSS、微信支付等服务
  src/db/                   # PostgreSQL 与本地内存实现
  scripts/                  # 测试和部署脚本
project.config.json         # 微信开发者工具入口，指向 miniprogram/dist/
```

根目录 `src/` 是历史客户端代码；当前小程序开发以 `miniprogram/src/` 为准。页面注册以 `miniprogram/src/app.config.ts` 为准，`case-detail` 尚未注册。

## 当前能力与边界

- 微信登录、当前案件管理、材料上传、OCR/图片分析、字段确认、付费权益及案件报告已有实现。
- 聊天输入支持可选的「口述经过」转文字，结果先进入可编辑草稿。微信同声传译插件已在灵迈小程序后台通过授权，默认构建启用；平台隐私声明与真机验收见 [语音输入接入](miniprogram/src/services/speech/README.md)。
- 对话由 DeepSeek 辅助理解自然描述，一次提取多个有原文依据的事故事实，先回应问题，再核对信息和追问缺项；确认、修改及页面操作仍由状态机控制。模型调用最多等待 6.5 秒，失败时退回本地规则。报告目前只使用**已确认的材料字段**，并非全部聊天内容。
- 按案件一次性收费，金额由后端返回；默认配置为 4990 分。本案件补充材料后可重新分析。
- 微信支付 API v3 已接入下单、查单、关单及签名校验后的回调处理；权益以服务端确认结果为准。
- 材料确认发生变化会使旧报告失效；报告发布前会核对材料快照，避免发布过时结果。
- **文书生成尚未实现**，不属于当前开放权益；`documentGeneration` 返回 `false`。
- **PDF/Word 导出尚未实现**，已移除当前报告页的导出入口；`POST /api/reports/:caseId/export` 当前返回 501。
- 隐私页支持提交并查询数据导出、删除、注销的人工核验申请；申请入库不等于操作完成。运营处理与发布前待确认项见 [数据申请处理](server/docs/PRIVACY_REQUESTS.md)。
- 本地测试与构建通过不代表真实微信支付、云数据库、OCR/AI 服务或微信真机联调已验收。

## 本地开发

分别在 `server/` 和 `miniprogram/` 执行 `npm install`。后端配置从模板开始：

```bash
cd server
cp .env.example .env
```

按环境配置微信登录、JWT、数据库、OSS、OCR、AI 服务及支付。配置项以 `server/src/config/index.ts` 和环境模板为准。`DB_TYPE=memory` 仅适合本地开发/测试，重启后数据丢失；staging/production 要求 PostgreSQL 和真实服务配置。

分别在两个终端启动：

```bash
# 终端一：后端
cd server
npm run dev
```

```bash
# 终端二：小程序编译与监听
cd miniprogram
npm run dev:weapp
```

微信开发者工具导入**仓库根目录**，由 `project.config.json` 定位编译产物。前端默认 API 为 `http://localhost:8000/api`；真机需配置可访问的服务地址，生产构建必须设置 HTTPS `TARO_APP_API_BASE`。

## 当前 API 入口

除登录、健康检查和验签支付通知外，业务接口需要登录凭证。路由挂载以 `server/src/index.ts` 为准；历史文档中的 `/api/agent` 和 `/api/files/presign` 不属于当前挂载接口。

| 能力 | 接口 |
| --- | --- |
| 健康检查 | `GET /api/health` |
| 微信登录、会话 | `POST /api/auth/wechat/login`、`GET /api/auth/session` |
| 数据申请、查询进度 | `POST/GET /api/privacy/requests` |
| 当前案件 | `GET/POST/PATCH/DELETE /api/cases/current` |
| 当前权益 | `GET /api/cases/current/entitlement` |
| 创建订单、查询订单 | `POST /api/cases/:caseId/payment-orders`、`GET /api/payment-orders/:orderId` |
| 全部订单记录（按登录账户隔离） | `GET /api/payment-orders?limit=20&offset=0` |
| 微信支付通知 | `POST /api/payments/wechat/notify` |
| 对话 | `POST /api/conversations/current`、`GET/POST /api/conversations/current/messages` |
| 上传图片、视频 | `POST /api/upload/image`、`POST /api/upload/video` |
| 材料处理、确认、列表 | `POST /api/materials/process`、`POST /api/materials/confirm`、`GET /api/materials/:caseId` |
| 生成、读取报告 | `POST /api/reports/generate`、`GET /api/reports/:caseId` |

报告生成和读取均返回 `{ success: true, data: { report } }`。

## 验证

从仓库根目录执行；测试使用内存数据库并跳过本地 `.env`：

```bash
npm --prefix server run build
./miniprogram/node_modules/.bin/tsc --noEmit -p miniprogram/tsconfig.json
DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DB_TYPE=memory npm --prefix server test
DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DB_TYPE=memory ./server/node_modules/.bin/tsx --test miniprogram/tests/*.test.ts
```

小程序开发构建：

```bash
npm --prefix miniprogram run build:weapp:dev
```

客户端环境文件由 Taro 从 `miniprogram/` 读取。需要固定本机联调地址时，在
`miniprogram/.env.development.local` 中设置 `TARO_APP_API_BASE=https://<测试后端域名>/api`，
再执行上述构建命令。该本地文件已被 Git 忽略，不用于正式发布；仓库根目录的
`.env.development` 不会被此客户端构建自动读取。API 地址应直达后端，避免使用会跳转到网站的域名。

微信开发者工具当前读取 `miniprogram/dist/`；`build:weapp:staging` 输出到
`miniprogram/dist-staging/`，执行该命令不会更新当前导入项目读取的目录。

## 部署

发布遵循 [项目协作规则](AGENTS.md)：先部署测试环境，客户端连接测试 API 完成相关功能验证，通过后再将已验证的代码版本部署到正式服务器。涉及微信支付等能力时需真机验证。本地构建通过不等于测试环境验收通过；后端部署和小程序上传微信分别按用户明确的发布范围执行。

后端构建后通过 `npm start` 启动；数据库迁移与 staging 部署步骤见 [部署指南](server/docs/DEPLOYMENT.md)。支付私钥和 API v3 密钥使用服务端文件或环境变量配置，不放入客户端或 Git。

当前上线前基线见 [2026-10-19 审查记录](server/docs/PRE_RELEASE_REVIEW_2026-10-19.md)，含支付验收来源、修复、验证结果、依赖告警范围和先后端后客户端的发布顺序。

小程序生产构建示例（替换为实际服务域名）：

```bash
cd miniprogram
TARO_APP_API_BASE=https://your-api.example.com/api npm run build:weapp
```

完成微信开发者工具和真机验证后，再上传并提交审核。历史交接文档用于了解背景，当前行为应结合代码和测试核实。

## 许可证

MIT
