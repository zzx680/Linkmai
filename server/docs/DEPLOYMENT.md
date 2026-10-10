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
/etc/linkmai/secrets/wechatpay_platform.pem
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
