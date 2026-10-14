# Staging 部署指南

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

使用 `server/ecosystem.production.config.js` 启动独立的 `linkmai-production-api` 进程。默认路径为：

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
