# 部署指南

## 环境隔离与并行开发

项目默认在服务器 staging 进行前后端联调和功能验收：代码可在本地修改，后端改动部署到 staging，开发者工具和手机微信通过 staging HTTPS API 验证。无需为日常联调在本机启动后端；本地后端仅作为可选的离线或模拟调试方式。production 只承载正式版本。

部署前仍需在开发机或 CI 完成构建及与改动相关的自动检查；自动检查通过不代表服务器联调通过。staging 与 production 使用独立的进程、端口、环境文件及数据库，即使位于同一台服务器也必须隔离。本文描述目标部署方式，不代表服务器当前已经配置并运行了两个环境，首次使用前应核实实际状态。

| 环境 | 小程序构建目录 | API 地址 | 用途 |
| --- | --- | --- | --- |
| 本地（可选） | `miniprogram/dist` | `http://localhost:8000/api` | 离线或模拟调试 |
| staging（默认联调） | `miniprogram/dist-staging` | `https://<staging-domain>/api` | 服务器后端测试、前后端联调和真机验收 |
| production | 正式构建使用 `miniprogram/dist` | `https://api.linkmai.com/api` | 正式版本 |

### 本地后端调试（可选）

仅在需要离线或模拟调试时，在一个终端启动本地后端；使用默认的服务器 staging 联调流程时跳过本节：

```bash
NODE_ENV=development DB_TYPE=memory PAYMENT_PROVIDER=mock ALLOW_MOCK_WECHAT_LOGIN=true PORT=8000 npm --prefix server run dev
```

本地后端使用内存数据库、mock 微信登录和 mock 支付，不连接 staging/production 数据库，也不会发起真实支付。`server/.env` 中其他外部服务配置仍可能生效；若需要联调 OCR、OSS 或模型 API，请配置专用测试凭据与资源，不要复用 production 资源。

在另一个终端启动小程序监听构建：

```bash
TARO_APP_API_BASE=http://localhost:8000/api npm --prefix miniprogram run dev:weapp
```

在微信开发者工具中打开仓库根目录项目。根目录 `project.config.json` 的 `miniprogramRoot` 指向 `miniprogram/dist/`。开发者工具模拟器可访问本机 `localhost`；真机不能通过 `localhost` 访问开发电脑，真机联调应使用 staging HTTPS 域名。

### 服务器 staging 后端与小程序

后端改动也必须先在服务器 staging 进行测试。先确认 staging 域名、进程、端口、数据库和环境文件，再按下文 staging 部署步骤发布待测 Git 版本，并执行 smoke tests。数据库迁移、订单持久化、权限和异常处理应根据本次改动在 staging 验证；涉及微信登录、OSS/OCR、AI 或支付时，还需验证实际服务调用与回调，不能仅依赖 mock 测试结果。

然后构建连接该 staging 后端的小程序，完成页面、接口及真机流程验收：

```bash
TARO_APP_API_BASE=https://<staging-domain>/api npm --prefix miniprogram run build:weapp:staging
```

在微信开发者工具中将 `miniprogram/dist-staging` 作为独立小程序项目导入，作为日常服务器联调入口。可选的本地项目与它分别打开。两个项目的输出目录互相独立：本地监听更新 `miniprogram/dist`，staging 构建输出到 `miniprogram/dist-staging`。如导入时需要生成项目设置，将其保留在被 Git 忽略的 `dist-staging` 目录，不要改写根目录 `project.config.json`。

staging API 域名必须配置为微信小程序 request/uploadFile 合法域名。真机测试应使用 HTTPS staging API，不要通过关闭合法域名校验来代替配置。

### production 小程序

正式构建显式指定 production API：

```bash
TARO_APP_API_BASE=https://api.linkmai.com/api npm --prefix miniprogram run build:weapp
```

本地和 staging 小程序包不得连接 production API；测试账号、材料、案件和支付操作不得写入正式环境。本地代码和本地构建不会自动修改服务器，只有执行后端部署脚本才会更新服务器；小程序上传微信是独立操作。`miniprogram/dist` 同时是本地和 production 构建输出目录，不要在本地监听构建运行时执行 production 构建；正式构建应在 staging 验收通过后单独执行，并在确认后再上传。

## 测试与发布顺序

- 所有正式发布先部署到 staging 并完成验证，通过后再发布 production，不跳过测试环境。
- 默认流程：开发机或 CI 构建与自动检查 → 后端部署服务器 staging → 小程序连接 staging 完成联调和真机验收 → 同一后端 Git 版本部署 production → 重新构建连接 production 的小程序并复验 → 上传微信并提交审核。
- 不要求先启动本地后端完成人工联调，但后端功能测试必须在服务器 staging 完成。发现问题后修改代码、重新部署 staging，并重新验证受影响的功能。
- 本地构建和单元测试通过不等于 staging 验收通过；小程序应连接 staging API 验证本次改动涉及的页面与接口，涉及微信支付等能力时应进行真机验证。
- production 部署使用 staging 验收通过的同一代码版本；如果代码之后有变化，应重新验证受影响的功能。
- 保留 staging 环境，通过正式部署脚本将验证过的后端代码发布到 production，由正式服务加载自己的配置，不把 staging 进程或数据库直接改为 production。小程序的 API 地址在构建时写入，微信开发者工具上传不会自动切换地址，审核包必须重新构建并确认连接正式 API。
- 执行前确认目标环境、API 地址、服务进程及数据库，避免把测试改动或数据写入 production。
- 后端部署与小程序上传微信是独立操作，按用户明确的发布范围执行；修改文档、本地编译或测试不代表授权部署正式环境或上传微信。
- 汇报时明确区分本地已修改、staging 已部署并验证、production 已部署，以及小程序已上传等状态。

## 架构

- 阿里云轻量应用服务器：Ubuntu 22.04，2 核 / 2 GiB / 40 GiB
- 服务器进程：Nginx + PM2 + 单实例 Node.js
- 数据库：独立 RDS PostgreSQL，不在轻量服务器安装 PostgreSQL
- 文件与识别：阿里云 OSS / OCR
- 客户端：微信小程序开发版，API 指向 staging HTTPS 域名
- 支付：微信支付 API v3，异步通知指向 staging API

2 核 2 GiB 足以承载 staging 和少量测试用户。正式生产建议至少 2 核 4 GiB。轻量服务器上不要同时运行 PostgreSQL、Redis 或模型服务。

## 部署前门禁

1. 确认实例已续费，不会在测试周期内到期。
2. 在轻量应用服务器控制台开启与 RDS 所在 VPC 的内网互通。
3. RDS 白名单只允许轻量服务器互通后的私网地址或网段。
4. 为 staging 创建独立数据库和最小权限用户，不与 production 共库。
5. 准备 staging API 子域名，例如 `staging-api.example.com`。
6. 只开放公网 80/443；SSH 22 仅允许管理 IP。
7. 不在 Git、聊天、命令历史中保存数据库密码、AppSecret 或支付私钥。

## 1. 准备服务器

安装运行依赖：

```bash
sudo apt update
sudo apt install -y nginx rsync curl certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

2 GiB 机器建议增加 2–4 GiB swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

将下列内容加入 `/etc/fstab`，确保重启后仍启用：

```text
/swapfile none swap sw 0 0
```

创建目录：

```bash
sudo mkdir -p /var/www/linkmai-staging/releases /etc/linkmai/secrets /var/log/linkmai
sudo chown -R "$USER":"$USER" /var/www/linkmai-staging /var/log/linkmai
sudo chmod 700 /etc/linkmai/secrets
```

## 2. 配置 RDS

- 使用 RDS 私网地址，不使用公网地址。
- 开启 SSL，并从 RDS 控制台下载 CA 证书。
- 创建 `linkmai_staging` 数据库和 `linkmai_staging` 用户。
- 在首次迁移前创建 RDS 快照。

应用通过版本化 migration 管理数据库：

```bash
npm --prefix server run build
npm --prefix server run db:migrate
```

迁移状态记录在 `schema_migrations`。已应用迁移的 checksum 不允许被修改。

## 3. 配置服务器密钥

从 `server/.env.staging.example` 创建 `/etc/linkmai/staging.env`：

```bash
sudo install -m 600 server/.env.staging.example /etc/linkmai/staging.env
sudoedit /etc/linkmai/staging.env
```

支付证书和密钥使用独立文件：

```text
/etc/linkmai/secrets/rds-ca.pem
/etc/linkmai/secrets/apiclient_key.pem
/etc/linkmai/secrets/wechat_api_v3_key
/etc/linkmai/secrets/wechatpay_public_key.pem
```

权限要求：

```bash
sudo chmod 600 /etc/linkmai/staging.env /etc/linkmai/secrets/*
```

关键配置：

- `NODE_ENV=staging`
- `DB_TYPE=postgres`
- `POSTGRES_SSL=true`
- `POSTGRES_SSL_CA_FILE=/etc/linkmai/secrets/rds-ca.pem`
- `ALLOW_MOCK_WECHAT_LOGIN=false`
- `PAYMENT_PROVIDER=wechat`
- `WECHAT_MCH_ID` 与小程序已关联的商户号一致
- `WECHAT_MCH_SERIAL_NO` 是商户 API 证书序列号
- `WECHAT_MCH_PRIVATE_KEY_FILE=/etc/linkmai/secrets/apiclient_key.pem`
- `WECHAT_API_V3_KEY_FILE=/etc/linkmai/secrets/wechat_api_v3_key`
- `WECHAT_PAY_PUBLIC_KEY_FILE=/etc/linkmai/secrets/wechatpay_public_key.pem`
- `WECHAT_PAY_PUBLIC_KEY_ID=PUB_KEY_ID_...`，必须与商户平台下载的平台公钥一致
- `WECHAT_PAY_NOTIFY_URL=https://<staging-domain>/api/payments/wechat/notify`
- `JWT_SECRET` 至少 32 字符随机值

staging 和 production 启动时都会严格校验这些配置，缺失时服务会拒绝启动。

## 4. 配置 Nginx 与 HTTPS

先使用不引用证书文件的 bootstrap 配置：

```bash
sudo cp server/deploy/nginx-staging-bootstrap.conf /etc/nginx/sites-available/linkmai-staging
sudoedit /etc/nginx/sites-available/linkmai-staging
sudo ln -s /etc/nginx/sites-available/linkmai-staging /etc/nginx/sites-enabled/linkmai-staging
sudo nginx -t
sudo systemctl reload nginx
```

DNS 生效后申请证书：

```bash
sudo certbot certonly --webroot -w /var/www/html -d <staging-domain>
```

证书签发成功后，替换为完整 HTTPS 模板：

```bash
sudo cp server/deploy/nginx-staging.conf /etc/nginx/sites-available/linkmai-staging
sudoedit /etc/nginx/sites-available/linkmai-staging
sudo nginx -t
sudo systemctl reload nginx
```

验证续期：

```bash
sudo certbot renew --dry-run
```

## 5. 发布与回滚

将仓库同步到服务器的临时源码目录后执行：

```bash
LINKMAI_ENV_FILE=/etc/linkmai/staging.env \
LINKMAI_HEALTH_URL=https://<staging-domain>/api/health \
./server/scripts/deploy-staging.sh
```

发布脚本会：

1. 检查环境文件和内存；
2. 创建带时间戳 release；
3. `npm ci`；
4. 运行测试和 TypeScript build；
5. 执行数据库 migration；
6. 原子切换 `current` 软链接；
7. PM2 reload；
8. 执行 health check；
9. 失败时回滚上一 release；
10. 只保留最近 3 个 release。

手动回滚：

```bash
./server/scripts/rollback-staging.sh
```

查看状态：

```bash
pm2 status
pm2 logs linkmai-staging-api --lines 100
```

配置开机恢复：

```bash
pm2 startup
pm2 save
```

## 5. GitHub Actions 正式发布

`.github/workflows/deploy-production.yml` 会在 `main` 有新提交时创建生产部署，也可从 GitHub Actions 手动重新运行。该工作流使用 GitHub Environment `production`；在仓库 Settings → Environments 中为它设置 Required reviewers，正常流程审批后才读取部署密钥并连接 ECS。若开启 Allow administrators to bypass configured protection rules，管理员可以手动绕过审批。该工作流目前只发布 production，不会自动部署或验证 staging；批准前必须确认同一 Git SHA 已完成 staging 验收。

在 `production` Environment 中设置以下 Secrets：

- `PROD_SSH_HOST`：ECS 主机名或公网 IP。
- `PROD_SSH_PORT`：SSH 端口。
- `PROD_SSH_USER`：当前服务器使用 `admin`。该账号需要可非交互执行 `sudo -n`；`linkmai` 是无登录 shell 的应用运行账号，不作为 SSH 登录账号。
- `PROD_SSH_PRIVATE_KEY`：仅用于 Actions 的部署私钥。
- `PROD_SSH_KNOWN_HOSTS`：预先验证过的 ECS host key（known_hosts 格式）。

工作流使用严格的 host key 校验，不会在运行中执行 `ssh-keyscan`。它只同步源码到 `/var/www/linkmai-production/source`，随后在 ECS 上执行 `server/scripts/deploy-production.sh`；生产环境文件和证书继续只保留在 `/etc/linkmai/production.env` 与 `/etc/linkmai/secrets/`。工作流以不可取消的串行队列运行，避免中断迁移或 release 切换。

2026-10-28 只读核实：发布根目录归 root 所有，环境文件为 `root:linkmai` 且权限为 640；现有 PM2 daemon 由 root 管理，Node 应用以 `linkmai` 运行，`admin` 已有免密 sudo 权限。工作流据此用 sudo 创建归 SSH 登录账号所有的源码目录，再以 `sudo -n env PM2_HOME=/root/.pm2` 执行发布脚本，复用现有 PM2 daemon。不能直接以普通 `admin` 执行发布脚本，否则目录写入、环境文件读取和 `chown` 会失败；也不能使用 admin 自己的 PM2 daemon 管理正式进程。此工作流依赖现有的高权限部署账号，不是受限部署账号方案；本次没有修改服务器 sudo 配置。

## 6. 微信小程序 staging 构建

使用 HTTPS staging API 构建：

```bash
TARO_APP_API_BASE=https://<staging-domain>/api npm --prefix miniprogram run build:weapp:staging
```

产物位于 `miniprogram/dist-staging`。

微信公众平台需要配置：

- request 合法域名：staging API 域名
- uploadFile 合法域名：staging API 域名
- downloadFile 合法域名：仅在启用下载功能后配置

不要通过关闭合法域名校验代替真实 staging 配置。

## 7. 微信支付验证

回调地址：

```text
https://<staging-domain>/api/payments/wechat/notify
```

Nginx 和 Express 必须保持原始请求体不变。回调路由无需 JWT，但会校验微信签名、平台序列号、AppID、商户号、金额和订单归属。

真实付款前单独确认测试金额和付款账号。建议 staging 金额为 1 分，并验证：

- 用户取消支付；
- 支付成功但客户端退出；
- 回调延迟和重复回调；
- 金额不一致被拒绝；
- 已支付案件不重复收费；
- 服务重启后订单和权益仍可查询。

## 8. Smoke tests

部署完成后运行：

```bash
npm --prefix server run staging:smoke -- https://<staging-domain>
```

应验证：

- `/api/health` 返回 200；
- 未认证 session/case 接口返回 401；
- 缺少微信 code 返回 400；
- 受保护上传接口返回 401。

随后在微信真机完成：登录 → 创建案件 → 上传 → OCR → 确认材料 → 支付 → 回调 → 生成并重开报告。

## 9. 运维与安全

- 安装并配置 `pm2-logrotate`，单文件 10 MB，保留 7 天。
- 开启 RDS 自动备份，并至少做一次恢复演练。
- 每次发布记录 Git SHA、migration 版本和 release ID。
- 日志不得写入 AppSecret、数据库密码、支付私钥、API v3 key 或完整敏感材料。
- 监控内存超过 80%、磁盘超过 75%、5xx、数据库不可用和支付回调失败。
- 保持轻量服务器安全更新与实例续费。

# Production 部署指南

Production 与 staging 必须使用独立的域名、主机/进程、PostgreSQL 数据库、OSS 权限、微信支付回调和环境文件。不得复用 staging 环境文件、私钥、数据库、商户测试设置或部署目录。

2026-10-17 部署例外：项目负责人明确授权复用现有 OSS、OCR、AI 和微信支付凭据。
本次保持生产数据库、数据库账号、JWT、环境文件、进程、端口及支付回调独立；
生产金额使用 4990 分，staging 金额仍为 1 分。复用的是同一小程序和商户的外部服务凭据，
不复制测试订单、用户、材料或权益；不得将 staging 环境文件整体覆盖生产配置。

## 生产发布前 Go / No-Go

在执行迁移、部署、上传小程序或提交审核前，负责人必须确认：

1. 正式 API 域名、DNS、TLS 证书、网络访问策略和发布窗口已就绪。
2. RDS 使用独立生产库、最小权限账号、私网访问与 SSL；已创建新备份并在生产等价环境演练恢复。
3. 小程序 AppID 已绑定正式商户号，微信支付异步通知可访问 `https://<production-domain>/api/payments/wechat/notify`。
4. 值班、告警、代码回滚和数据库恢复的责任人已明确。
5. 所有正式凭据只存放在受限的服务器文件或密钥系统中。若任一凭据曾进入 Git、聊天、构建日志或客户端制品，先完成轮换与暴露评估。

任一条件未满足即停止发布。

## 1. 生产环境文件与密钥

从 `server/.env.production.example` 建立服务器外部环境文件：

```bash
sudo install -m 600 server/.env.production.example /etc/linkmai/production.env
sudoedit /etc/linkmai/production.env
```

生产证书和密钥使用独立文件，例如：

```text
/etc/linkmai/secrets/rds-ca.pem
/etc/linkmai/secrets/apiclient_key.pem
/etc/linkmai/secrets/wechat_api_v3_key
/etc/linkmai/secrets/wechatpay_public_key.pem
```

设置目录和文件权限：

```bash
sudo chmod 700 /etc/linkmai/secrets
sudo chmod 600 /etc/linkmai/production.env /etc/linkmai/secrets/*
```

生产启动会由 `validateRuntimeConfig()` 强制校验：PostgreSQL、远端数据库 SSL/CA、非默认且不少于 32 字符的 JWT 密钥、禁用 mock 微信登录、`PAYMENT_PROVIDER=wechat`，以及完整的微信商户证书、APIv3 key、平台公钥/ID 与 HTTPS 回调地址。不要绕过或弱化这些校验。

## 2. Nginx 与 PM2

使用 `server/deploy/nginx-production-bootstrap.conf` 申请正式域名证书，再替换为 `server/deploy/nginx-production.conf`。将其中的 `PRODUCTION_API_DOMAIN` 替换为已确认的正式域名；不要把真实域名或证书路径提交到仓库。

使用 `server/ecosystem.production.config.js` 启动独立的 `linkmai-production-api` 进程。
生产 Node 服务监听 `127.0.0.1:8200`，staging 监听 `127.0.0.1:8100`，避免同机部署时端口冲突。默认路径为：

```text
/var/www/linkmai-production/current/server
/etc/linkmai/production.env
/var/log/linkmai/production-out.log
/var/log/linkmai/production-error.log
```

## 3. 数据库迁移与恢复边界

迁移器会校验 `schema_migrations` 中已执行文件的 checksum，并会在单个迁移失败时回滚该迁移事务。严禁修改已应用迁移文件。

每次 production 发布前：

1. 创建并记录 RDS 备份标识。
2. 在恢复环境验证该备份可用，执行待发布版本的 `npm run db:migrate`。
3. 确认旧应用在迁移后的 schema 上仍可运行，或准备经过演练的数据库恢复处置。

`rollback-production.sh` 只能回滚代码 release，不能回滚已执行的 schema、支付订单或权益数据。若迁移与旧代码不兼容，停止扩大流量并依照恢复预案处置，不要把代码软链接回退当作数据库回滚。

## 4. 发布与代码回滚

先将经过审查的同一 Git SHA 同步到生产候选目录。发布脚本会安装依赖、构建、测试、加载受限环境文件、运行生产配置校验、执行迁移、原子切换 release、reload PM2 并进行 health check：

```bash
LINKMAI_ENV_FILE=/etc/linkmai/production.env \
LINKMAI_HEALTH_URL=https://<production-domain>/api/health \
./server/scripts/deploy-production.sh
```

只在迁移仍与前一 release 兼容时使用代码回滚：

```bash
LINKMAI_ENV_FILE=/etc/linkmai/production.env \
./server/scripts/rollback-production.sh
```

发布后的无凭据烟测：

```bash
./server/scripts/smoke-production.sh https://<production-domain>
```

它只验证 health 和未认证接口保护，不会创建订单或发起扣款。

## 5. 微信支付与小程序验收

在提交小程序审核前，由授权人员在真机完成正式闭环：登录 → 创建案件 → 上传并确认材料 → 发起受控小额支付 → 回调验签 → 权益解锁 → 生成并重新读取报告。

至少覆盖取消支付、客户端退出后恢复订单、延迟或重复回调、服务重启后查询订单、金额/AppID/商户号不匹配被拒绝，以及日志不含私钥、token、APIv3 key 或完整签名。

仅在正式 API 域名已配置为微信 request/uploadFile 合法域名后构建小程序：

```bash
TARO_APP_API_BASE=https://<production-domain>/api npm --prefix miniprogram run build:weapp
```

确认 `miniprogram/dist` 不含 staging 地址或秘密后，在开发者工具和真机复验支付路径。上传、提交审核和正式发布均需要单独的负责人授权。

## 6. 生产监控

上线后观察 health、5xx、数据库连接、进程内存和磁盘、支付下单成功率、回调失败率与订单状态异常。人工核对微信商户账单、服务端订单和案件权益的一致性；异常时先停止扩大流量，再按代码回滚或已演练的数据库恢复预案处置。

## 案件计算、文书与律师审核（P2–P4，本地实现待验收）

### 功能边界与当前状态

代码位于 `server/src/harness/`，新增迁移为 `0009_case_workflow.sql`。本次仅修改本地源码，未执行远程迁移或部署。默认关闭新流程；本节不能替代 staging 和律师验收。

- P2：七类损失项目试算（医疗、误工、护理、交通、住院伙食补助、营养、车辆损失），金额使用整数分；日期、地区、公式和地区参数均留有版本引用。主张范围、输入或地区标准缺失时不给出确定总额。
- P3：事故分析报告、证据目录、材料补充清单/行动计划；在线草稿、用户确认、新版本与旧版本失效。现阶段采用确定性模板，不依赖模型生成金额，不等同于完整法律推理 Agent。DOCX/PDF 暂未开放。
- P4：独立审核身份、内部创建律师账号、分配/改派、原始材料临时访问、法规原文、上一版本对照、退回后重生成、批准、两天目标 SLA 和审计。目标时间不代表保证完成时间，超时不会自动批准。
- 当前没有独立可信的风险筛查记录，上传材料字段也可由用户编辑，因此所有草稿均需指定律师复核；用户勾选或材料中的“已筛查”不能免除审核。退款后禁止继续打开审核详情、分配或批准。
- 输入、材料、规则或法律资料发生变化，旧产物及其审核不能继续批准。普通用户令牌不能用于审核接口，管理员不能代替任务指定律师批准文书。
- 计算结果是损失项目合计，不自动认定责任比例，不扣减既付款或保险赔付；伤残、死亡等复杂项目不在本计算器范围。

P1 只为上述闭环补充了必要的静态 Skill、受控上下文、Worker 租约和验证器。现有对话 Agent 保留；完整的多任务模型路由、全量状态机评测、生产容量指标以及律师独立质量评测仍需后续验收，不能仅以构建通过宣布计划全部完成。

### 开启前的准备

1. 使用隔离的本地或 staging PostgreSQL，按前文环境管理方式加载该环境配置，然后在 `server/` 运行 `npm run build`、`npm run db:migrate`。不要将测试配置指向生产数据库。
2. 在目标环境设置独立的 `REVIEW_JWT_SECRET`（至少 32 字符，必须不同于普通用户 `JWT_SECRET`）。密钥进入既有环境文件或密钥管理系统，不提交 Git。审核 JWT 使用独立 issuer/audience，时效两小时，停用账号即时阻止后续请求。
3. 通过安全渠道临时提供 `REVIEW_BOOTSTRAP_EMAIL` 和 `REVIEW_BOOTSTRAP_PASSWORD`（密码至少 12 字符），运行 `node dist/scripts/bootstrap-review-admin.js`。只允许初始化一个管理员，脚本要求 PostgreSQL；执行后移除这两个临时变量。不要在命令历史或日志中写密码。
4. 设置 `HARNESS_ENABLED=true`，重启该环境服务。服务启动将校验审核密钥。小程序通过 `/api/health` 的 `features.caseHarness` 切换已解锁案件的报告页面。
5. 打开同一后端的 `/review/`，登录管理员账号，创建受邀律师账号；初始密码由运营通过受控渠道交付。当前不提供公开注册、律师市场或自动邮件邀请。
6. 导入并审核真实法规，核验公式后启用 `compensation-v1`，发布首批地区参数。新库没有预置可直接投产的地区金额；缺少有效规则时计算接口拒绝出结果。
7. 使用测试权益和合成案件完整验证一轮草稿 → 用户确认及人工复核同意 → 分配 → 退回 → 修订 → 再审 → 批准；再验证退款、改派、材料修改和法规撤销后的访问限制。

审核静态页面位于 `server/public/review/`，现有 release rsync 会包含该目录。若通过自定义打包发布，必须一并包含此目录；编译后的代码根据 `dist/../public/review` 定位文件。

### 法规和地区规则管理

管理端的法规 JSON 导入框对接 `POST /api/review/legal/import`，仅管理员可用。格式如下（占位文本必须替换为已核验的真实资料；示例不是可发布法律依据）：

```json
{
  "id": "unique-law-version-id",
  "title": "资料正式标题",
  "authority": "发布机关",
  "documentType": "法律或地方标准",
  "jurisdiction": "CN-ZJ-HZ",
  "sourceUrl": "https://www.gov.cn/官方原文路径",
  "version": "资料版本",
  "effectiveFrom": "2026-01-01",
  "sourceText": "已核验的完整原文，必须包含下面逐条导入的条文原文。",
  "sections": [
    {
      "legalRefId": "unique-law-version-article-id",
      "articleNumber": "第一条",
      "content": "已核验的条文原文，须是完整原文的连续片段。",
      "keywords": ["医疗费"]
    }
  ]
}
```

只接受 HTTPS 的 `gov.cn` 及其子域名来源。后台核对原文包含关系并计算内容和来源哈希；不会代替审核人员抓取或证明远程网页真实性。文档、条文、原文存档及导入审计在同一事务提交。新资料默认 pending，管理员需查看原文/官方来源/日期后显式审核；撤销会使相关产物失效。已有版本 ID 和引用 ID 不可覆盖，修订须用新 ID；历史内置资料不一定有完整原文存档，应先核验来源。

计算器发布接口为 `POST /api/review/calculator/publish`，请求为 `{"version":"compensation-v1","legalRefs":["已审核条文ID"]}`。地区参数为 `POST /api/review/parameters`，字段：`id`、`version`、`code`（`meals_daily_cents` 或 `nutrition_daily_cents`）、`jurisdiction`、`from`、可选 `to`、`value`（整数分/日）、`legalRefs`。参数只按精确地区及事故日期匹配，不猜测上级地区标准；同项目同地区的批准区间不能重叠。适用法律失效的参数不能参与计算。小程序提供省份及杭州地区选择；新增城市时需同步地区选项与已审核覆盖范围。

计算规则和参数发布后不可原地修改。参数撤销为 `POST /api/review/parameters/:id/retire`；计算器停用为 `POST /api/review/calculator/retire`。变更计算公式必须增加代码和规则版本，不能用旧 ID 覆盖已审核公式。

### 运行、隐私与回滚

- Worker 与 API 同进程启动，每秒扫描待处理任务，使用数据库事务领取；租约 30 秒，最多三次退避重试。过期租约可以恢复，旧 token 无法提交迟到结果。耗尽自动重试后，用户显式重新运行会增加案件 revision，并保留失败记录。
- 当前模板生成不进行远程模型调用；Run 保存实际使用的 `deterministic-template` 模型快照、版本和时间。不能据此声称已实现模型主备路由、Token 成本计量或自由生成法律意见。
- 审核用户令牌只在浏览器内存保存。只有被指定且已打开当前任务的有效律师可申请该任务引用材料的 300 秒签名 URL，访问记录只存实体 ID 和动作，不记录签名 URL 或原文。任务失效后不能再申请新链接；已签发链接在有效期内仍可能可访问。
- 用户首次提交人工复核会单独确认资料使用说明，服务器要求 `reviewConsentVersion=review-v1` 并记录审计。上线前仍须由运营/法律人员批准正式协议、隐私文案、审核人员资质和客服渠道。
- 当前策略发布与案件命令使用全局 PostgreSQL advisory lock，优先保证发布与规则变更的一致性；需在 staging 测量 P95、锁等待和吞吐后决定是否拆分读写及锁粒度，不应据此预估生产容量。
- 暂停新分析/新审核提交：设置 `HARNESS_PAUSED=true` 后重启。用户仍可查看进度，已有审核可由运营处理；不会把高风险产物自动批准。
- 初次试点前可保持 `HARNESS_ENABLED` 未设置。已经提供新审核服务后，不应靠关闭 gate 重新走旧报告生成路径来绕过审核；先使用暂停开关，再制定历史版本的回退与告知方案。迁移为增量，保留表和审计，不通过删除表回滚。

### 验证与上线门槛

本地逻辑测试：在 `server/` 运行 `node --import tsx --test scripts/case-workflow.test.ts`。完整回归使用 `npm test`，同时完成 `npm run build`、`npm run lint` 及小程序类型检查和微信编译。

真实数据库专项仅对临时本地测试库运行：应用迁移后，显式设置 `NODE_ENV=test`、`DB_TYPE=postgres`、`POSTGRES_HOST=127.0.0.1`、`POSTGRES_DB=专用名称含test的数据库`，并提供该库的独立账号，设置 `WORKFLOW_POSTGRES_TEST=1`，再运行 `node --import tsx --test scripts/case-workflow-postgres.test.ts`。该测试会写入/删除合成数据并改变测试规则状态，禁止对共享业务库运行。未设置开关时会跳过，跳过不代表通过。

2026-10-27 本地审查已完成：后端构建、lint 和 147 项常规测试通过；常规测试跳过的三个 PostgreSQL 专项已在隔离 PostgreSQL 15 临时库单独运行通过，涵盖九个迁移、任务并发、连接池满载读取、批准与失效、法规导入事务回滚及法律检索。小程序 110 项测试、类型检查和微信编译通过；审核网页使用合成案件验证登录、资料查看与批准。审查修复了事务中重复借用连接、用户可编辑字段免除风险审核、退款后的审核访问和同源登录被跨域白名单拦截的问题。这些结果不代表 staging 或生产环境已部署验收。

投产前仍须完成：目标环境迁移及并发复验、staging 双轨验收、三类文书与赔偿规则的律师独立样本评测、目标地区规则覆盖、审核人员与 SLA 超时接管、权限与隐私检查及支持渠道准备。DOCX/PDF 可按计划暂缓，但高风险产物不能暂缓审核后发布。
