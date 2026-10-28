# 数据库迁移指南

发布顺序与环境权限以[部署指南](docs/DEPLOYMENT.md)为准。本文件只说明数据库变更，不提供另一套生产部署路径。

## 环境与数据边界

- 本地内存数据库用于可选调试，重启丢失；没有可用的 `migrate:export` / `migrate:import` npm 脚本，不承诺自动将内存数据迁入 PostgreSQL。
- staging 和 production 必须使用不同数据库、账号及业务数据。2026-10-28 核实两环境都连接服务器 loopback PostgreSQL；不是已部署的远程 RDS。
- loopback 数据库允许 `POSTGRES_SSL=false`；远程 PostgreSQL/RDS 必须启用 TLS 并配置可信 CA。不要把本地连接示例直接用于远程库。
- PostgreSQL 的服务安装、建库和角色授权属于首次基础设施准备，不在每次发布中重复执行。数据库服务只监听所需私网或 loopback 接口，不因部署开放公网 5432。

## 唯一的 schema 变更入口

迁移文件位于 `server/migrations/`。发布候选源码应包含迁移文件和编译后的 `dist/scripts/migrate.js`，并在 `server/` 为工作目录执行：

```bash
npm run build
npm run db:migrate
```

这里仅展示入口含义，实际执行前必须明确加载目标环境配置。正常 `deploy-staging.sh` / `deploy-production.sh` 已包含构建与迁移，不要再重复执行一套手工初始化。两环境现共用失败即停止的门禁，迁移失败不切换 current；回退与验收仍遵循部署指南。

迁移器按文件名排序执行，以 `schema_migrations` 记录版本与 checksum；使用数据库锁协调迁移，每个迁移在事务中应用。已应用文件不能改写，只能新增迁移。不要直接执行旧 `scripts/init-db.sql`，也不要用 Prisma 示例命令替代当前迁移器。

## 单独执行迁移的约定

只在明确需要且已授权时单独迁移。阿里云服务器终端示例（替换候选目录，只针对 staging）：

```bash
sudo -n bash <<'REMOTE'
set -euo pipefail
cd '/var/www/linkmai-staging/source/<已提交SHA>/server'
set -a
source /etc/linkmai/staging.env
set +a
DOTENV_CONFIG_PATH=/dev/null npm run db:migrate
REMOTE
```

候选目录须已构建且依赖完整。不要通过更换数据库名称或复制环境文件把此命令直接用于正式环境；正式迁移按已确认的发布入口执行。

执行前确认数据库目标、独立账号、待应用版本和相关备份；执行后核对迁移日志与 `schema_migrations`。`npm run db:test` 仅检查基础表且会读取本地 `.env`，不能代替完整迁移状态检查。

## 测试、备份和恢复

迁移首先在独立测试库验证，再在 staging 做业务验收。真实 PostgreSQL 专项测试中存在清理合成数据的操作，只能针对明确可清理的独立测试库；不能对 staging 业务库或生产库运行。

涉及正式 schema 变更时，记录发布 SHA、迁移版本、对应数据库备份及恢复验证；本机 PostgreSQL 使用实际备份方案，迁移到 RDS 后再采用其快照方案。恢复应先在隔离目标验证，不能把示例恢复命令直接覆盖运行中的业务库。

代码回滚不会撤销已提交迁移，也不会恢复订单、支付或权益。上线前确认旧版本与迁移后 schema 的兼容性；不兼容时按已演练的数据库恢复方案处理。不要为回滚直接删除新表或修改历史迁移 checksum。

## 功能专项

案件计算、律师审核、法规及地区参数的初始化和 PostgreSQL 专项要求见[功能运维](docs/CASE_WORKFLOW_OPERATIONS.md)。报告提醒、隐私申请等新增表也由同一个迁移目录管理，不逐功能手工执行 SQL。
