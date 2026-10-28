# 灵迈后端

当前服务使用 Express、TypeScript（CommonJS）、`pg` 和版本化 SQL 迁移。此目录原 Prisma 初始化示例不代表当前运行或部署入口。

## 入口

- `src/index.ts`：HTTP 服务、鉴权、健康检查和功能开关。
- `src/config/index.ts`：环境变量、文件密钥和运行配置校验。
- `migrations/`、`src/scripts/migrate.ts`：版本化 SQL 迁移，记录于 `schema_migrations`。
- `ecosystem.staging.config.js`、`ecosystem.production.config.js`：PM2 配置。
- `scripts/deploy-*.sh`、`scripts/rollback-*.sh`、`scripts/smoke-*.sh`：发布、代码回滚与接口检查。

默认在服务器 staging 联调；本地内存后端是可选调试方式。依赖安装和启动见[快速开始](../QUICKSTART.md)，所有服务器发布操作统一见[部署指南](docs/DEPLOYMENT.md)。

## 脚本含义

在 `server/` 下执行；从仓库根目录可使用 `npm --prefix server`。

| 命令 | 含义 |
| --- | --- |
| `npm run dev` | 本地开发监听，不是正式进程管理入口 |
| `npm run build` | 编译 TypeScript，不执行迁移或发布 |
| `npm start` | 启动已有 `dist/index.js`，不会自动设置环境或配置 PM2 |
| `npm run db:migrate` | 从当前 `migrations/` 向指定数据库执行待应用迁移，需先构建并核实配置 |
| `npm run db:migrate:dev` | 开发阶段直接运行 TypeScript 迁移器 |
| `npm run db:init` | `db:migrate` 别名，不是 Prisma 建表或重置数据库 |
| `npm test` | 常规自动测试；独立 PostgreSQL 专项可能跳过，跳过不代表通过 |
| `npm run lint` | 后端静态检查 |

`db:test` 只检查连接与部分基础表，不能证明全部迁移已完成；它还会读取 `server/.env`，服务器发布不要据此猜测目标配置。迁移、备份与恢复见[数据库迁移](MIGRATION.md)。

## 配置和功能运维

staging/production 配置保存在服务器外部环境文件，客户端不持有 AppSecret、数据库密码或支付私钥。应用启动时进行严格环境校验，当前服务器由 root 的 PM2 管理，以 `linkmai` 账号运行 Node；实际权限及命令见部署指南。

- [云服务配置](docs/ALIYUN_SETUP.md)
- [OSS 上传链路](docs/OSS_INTEGRATION.md)
- [案件计算、文书与律师审核](docs/CASE_WORKFLOW_OPERATIONS.md)
- [数据申请处理](docs/PRIVACY_REQUESTS.md)

P1 总结、API 交接和日期记录保留作历史资料，不能作为当前部署批准或运行状态。
