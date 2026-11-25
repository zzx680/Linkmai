# 灵迈 LinkMai 阿里云部署（复用现有 ECS）

这套配置把 LinkMai 部署到**现有阿里云 ECS + 本机 Docker PostgreSQL + OSS**，让这台服务器只服务
LinkMai 官网/工作台。小程序先「暂停服务」，旧 API 和旧站点停掉后，新栈直接接管
`80/443`，不需要再买一台 ECS。

```
                         ┌──────────────────────────────┐
   浏览器 ──────────────▶│ edge (nginx, 80/443)          │
                         │  apex: /auth/v1 /api /         │
                         │  www: 301 → apex               │
                         └──────────────┬───────────────┘
                                        ▼
                                 frontend:3000
                                        │
                                        ▼
                                 backend:3001 ──▶ Redis
                                   │      │
                                   │      └──▶ OSS (storage.linkmai.com)
                                   ▼
                            gateway:8000
                            ├─ /auth/v1 → auth:9999  ──▶ db:5432
                            └─ /rest/v1 → rest:3000  ──▶ db:5432
```

> 重要：这台服务器上原来跑着小程序 API 和旧官网。旧服务已停止，旧数据库/源码已备份到
> 本机（见仓库外的 `Linkmai-backups`），服务器只保留新栈；需要回滚时从备份恢复。
> 不做 Word 插件，本配置不启动 `word` 容器，也不使用 `word.linkmai.com`。

## 0. 先确认三件事

| 项目 | 要求 |
| --- | --- |
| ECS | 建议 4 vCPU / 8 GB、100 GB 磁盘；2C4G 也能跑，但文档转换和构建会比较紧 |
| 端口 | `80`、`443` 必须能由新 `edge` 容器占用；旧 Nginx 要先停 |
| 备份 | 小程序数据库、上传文件、`.env`、Nginx 配置、PM2 配置都要先备份到 ECS 之外 |

先跑只读检查，不要改任何东西：

```bash
cd /opt/linkmai   # 或你放代码的目录
./deploy/scripts/preflight-reuse.sh
```

把输出里的域名、Token、数据库密码脱敏后再发出来。重点看：

- `free -h`：可用内存是否 ≥ 6 GB；
- `df -h`：根分区至少留 30 GB；
- `ss -lntp`：80/443 被哪个进程占用；
- `nginx -T` 过滤结果：旧站点和小程序 API 的 server_name / proxy_pass；
- `pm2 ls` 或 `docker ps`：旧 API 怎么跑的。

## 1. 小程序下架

这一步只能在微信公众平台后台操作，代码和服务器都替代不了。建议按「先暂停、不注销」处理：

1. 管理员扫码登录 [微信公众平台](https://mp.weixin.qq.com/)。
2. 进入 **设置 → 基本设置 → 账号信息 → 暂停服务**。
3. 暂停原因填「业务调整」，确认暂停。
4. 再到 **设置 → 隐私与安全**，关闭「通过名称搜索此小程序」，避免新用户还能搜到。
5. 观察 1–2 周，确认没有必须保留的用户/支付/数据诉求，再考虑是否「账号注销」。

说明：

- 「暂停服务」后用户不能再访问线上版本，但账号、代码、数据都还在，可恢复。
- 「账号注销」不可逆，且可能影响备案/主体信息；现在不要做。
- 暂停服务不会自动删除云上数据库和 OSS 文件，旧服务器上的数据仍要自己备份。

参考：[微信开放社区：暂停服务路径](https://developers.weixin.qq.com/community/minihome/doc/000668ad6e8c40e4b1d3433316b800)、[社区讨论：暂停服务与关闭搜索](https://fuwu.weixin.qq.com/community/develop/doc/0002aa02650d1095d34085b5861400)。

## 2. 备份旧服务（必须做）

先找到旧 API 的数据库连接和上传目录。不要直接把密码贴到聊天里。

```bash
# 1) 旧代码、环境变量、PM2、Nginx 配置
sudo tar czf /root/linkmai-old-config-$(date +%F).tgz \
  /opt /srv /var/www /etc/nginx 2>/dev/null || true

# 2) PM2 进程列表与日志路径
pm2 ls > /root/pm2-list.txt 2>&1 || true
pm2 save || true

# 3) PostgreSQL 备份（把 $OLD_DATABASE_URL 换成旧 API 使用的连接串）
pg_dump --format=custom --no-owner --no-acl \
  --file=/root/linkmai-old-db-$(date +%F).dump "$OLD_DATABASE_URL"

# 4) 上传目录（按实际路径替换）
sudo tar czf /root/linkmai-old-uploads-$(date +%F).tgz /path/to/old/uploads
```

如果旧 API 用的是 OSS：在 OSS 控制台给旧 Bucket 开启版本控制，或把整个 Bucket 同步到另一个
Bucket。不要在新 LinkMai 的 Bucket 上覆盖旧文件。

把 `/root/*.dump`、`*.tgz` 下载到本地或另一台机器，确认能解开后再继续。

## 3. 停旧服务，让出 80/443

先构建好新镜像、填好配置，再停旧服务，减少停机时间。停之前确认备份已完成。

按 `preflight-reuse.sh` 的结果选择命令：

```bash
# 旧 API 如果是 PM2
pm2 stop <旧API进程名>
pm2 save

# 旧 API 如果是 systemd
sudo systemctl stop <旧API服务名>

# 旧站点如果是宿主机 Nginx
sudo systemctl stop nginx
sudo systemctl disable nginx   # 确认新栈稳定后再 disable

# 旧站点/旧 API 如果是 Docker
docker ps
docker stop <旧容器名>          # 不要 docker rm -v，不要删 volume
```

确认端口已释放：

```bash
sudo ss -lntp | grep -E ':(80|443)\b' || echo "80/443 free"
```

如果还有进程占用，先查清楚它是谁，不要直接 `kill -9`。

## 4. 域名与证书

### DNS

复用同一台 ECS 时，`@`、`www` **不需要改解析**，它们现在指向的 `114.55.96.52` 就是这台机器；
只是把 80/443 的服务从旧 Nginx 换成新 `edge`。

| 主机记录 | 类型 | 值 | 处理 |
| --- | --- | --- | --- |
| `@` | A | 现有 ECS EIP | 不变 |
| `www` | A | 现有 ECS EIP | 不变，新 edge 301 到 apex |
| `api` | A | 现有 ECS EIP | 小程序暂停后删除，或先保留但服务已停 |
| `staging-api` | A | 现有 ECS EIP | 同上 |
| `_dnsauth` | TXT | 阿里云证书验证值 | 保留 |
| `storage` | CNAME | `<bucket>.oss-cn-<region>.aliyuncs.com` | OSS 自定义域 |

`api` / `staging-api` 不要立刻删：先暂停小程序、观察一段时间，确认没有回滚需求再删。
删除前它们会指向一台已经停掉 API 的机器，返回 502/连接失败是预期现象。

### 证书

优先复用旧 Nginx 现有的 `linkmai.com`、`www.linkmai.com` 证书；没有就用阿里云免费 DV
重新申请（不需要买付费证书）。把文件放到 `deploy/certs/`，文件名必须是：

```
linkmai.com.pem / linkmai.com.key
www.linkmai.com.pem / www.linkmai.com.key
```

旧证书常见位置：

```bash
sudo find /etc/nginx /etc/letsencrypt -maxdepth 4 -type f \
  \( -name '*.pem' -o -name '*.crt' -o -name '*.key' \) -print
```

如果旧证书是 `fullchain.pem` + `privkey.pem`，复制并改名即可。证书私钥权限设 `600`，
只让 Docker 读取。详见 [certs/README.md](certs/README.md)。

## 5. 准备数据库、OSS、SMTP、模型

### 数据库（默认本机 Docker）

不需要买 RDS。`docker-compose.prod.yml` 内置 `supabase/postgres:17.6.1.136`，
数据放在命名卷 `db_data`，只走 Docker 内网，`5432` 不对公网开放。

- `db-init` 以 `postgres` 超级用户执行 `schema.sql` 和迁移；
- service key 的 JWT role 用 `service_role`，该角色在 Supabase 镜像里自带 `BYPASSRLS`；
- `auth` 用 `supabase_auth_admin`，`rest` 用 `authenticator`，密码由
  `deploy/db/init-roles.sh` 在首次初始化时设置。

RDS 仍可选，但当前 compose 默认不接外部数据库；要换 RDS 时再改 compose 与
`rds/bootstrap.sql`。对这台 2C4G 机器，本地库更省事，后面可用 `pg_dump` 迁移。

### OSS

按 [oss/README.md](oss/README.md)：私有 Bucket、绑定 `storage.linkmai.com`、HTTPS、
CORS、RAM 最小权限 AccessKey。关键变量：

```dotenv
OSS_REGION=cn-hangzhou
OSS_INTERNAL=true
OSS_ENDPOINT=https://oss-cn-hangzhou-internal.aliyuncs.com
OSS_PUBLIC_ENDPOINT=https://storage.linkmai.com
```

`OSS_ENDPOINT` 必须是内网地址；`OSS_PUBLIC_ENDPOINT` 必须是浏览器可达的自定义域。
误把公网 `*.aliyuncs.com` 填进去，新桶会报 `PublicEndpointForbidden`。

### SMTP

阿里云邮件推送 `smtpdm.aliyun.com`，优先 `587`（STARTTLS）；服务商只开 `465` 时再改。
发信地址必须验证并配 SPF/DKIM。`linkmai.com` 已有企业邮箱 MX 时不要覆盖，可用
`mail.linkmai.com` 作为发信子域。

### DeepSeek API

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key。
2. 把 `.env.prod` 里的 `DEEPSEEK_API_KEY` 填成该 Key。
3. 默认使用官方 OpenAI 兼容地址 `https://api.deepseek.com/v1`。

默认模型：`deepseek-v4-pro`（质量优先）、`deepseek-flash`（速度/成本优先）。
DeepSeek 是托管 API，不需要在 ECS 上装模型。

## 6. 安装依赖并生成配置

```bash
# Alibaba Cloud Linux / CentOS
sudo dnf install -y git postgresql curl
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker

# generate-secrets.mjs 需要 Node 22
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs

# Ubuntu 用：
# sudo apt update && sudo apt install -y docker.io docker-compose-v2 postgresql-client git curl
# curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs

sudo mkdir -p /opt/linkmai
sudo chown "$USER" /opt/linkmai
cd /opt/linkmai
git clone <你的仓库地址> .
```

如果代码还在开发机工作区，先 commit/push；ECS 上 clone 不到未提交的文件。

```bash
node deploy/scripts/generate-secrets.mjs
```

脚本会生成 `deploy/.env.prod`（权限 600）和 anon/service JWT、数据库密码、Redis 密码、
三个应用 secret。已存在时拒绝覆盖；确实要重建加 `--force`。

然后填写 `deploy/.env.prod` 里的 `CHANGE_ME`：

```dotenv
POSTGRES_PASSWORD=...        # generate-secrets 已自动生成
OSS_BUCKET_NAME=linkmai-prod
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=no-reply@linkmai.com
DEEPSEEK_API_KEY=sk-...
```

密码含 `#`、空格、`$` 时用单引号包住。模板里的 `SMTP_SENDER_NAME` 和
`LINKMAI_MODEL_CONFIG_JSON` 引号不要删。

### 默认模型（可选）

新用户、新会话在用户还没有选择时用部署默认模型；用户保存过的选择永远优先：

| 环境变量 | 影响范围 | 回退顺序（高 → 低） |
| --- | --- | --- |
| `LINKMAI_DEFAULT_CHAT_MODEL` | 主对话 | 当前会话已存模型 → 用户上次选择 → 部署默认 → 让用户选 |
| `LINKMAI_DEFAULT_TITLE_MODEL` | 标题生成 | 用户设置 → 部署默认 → 对话服务商的低成本模型 |
| `LINKMAI_DEFAULT_MEMORY_MODEL` | 记忆整理 | `MEMORY_CURATOR_MODEL` / 用户设置 → 部署默认 → 对话模型 |
| `LINKMAI_DEFAULT_TABULAR_MODEL` | 新建表格审阅 | 用户设置 → 部署默认 → 必须手选（旧行为） |
| `LINKMAI_DEFAULT_SUBAGENT_MODEL` | 子任务助手 | 对话内显式指定 → 用户设置 → 部署默认 → 按任务匹配 |

默认值同样要过模型校验：模型没在 `LINKMAI_MODEL_CONFIG_JSON` 里、该账号没有对应
组织密钥、或不在它所属 router 的 Model Selections 里，都会被跳过并回退，不会写进
数据库，也不会发给服务商。上线先设 `deepseek-v4-pro` / `deepseek-flash` 这组。

## 7. 初始化数据库并启动

```bash
./deploy/scripts/compose.sh config
./deploy/scripts/compose.sh build
./deploy/scripts/compose.sh up -d
```

首次启动顺序：

1. `db` 启动并完成角色初始化；
2. `auth` 连接本机 `db`，创建 `auth.users` 等表；
3. `db-init` 等 `auth.users` 出现，以 `postgres` 执行 `schema.sql` 和迁移；
4. `backend` 在 `db-init` 成功后启动；
5. `frontend` 在 backend 健康后启动；
6. `edge` 最后启动，占用 80/443。

观察：

```bash
./deploy/scripts/compose.sh ps
./deploy/scripts/compose.sh logs -f db-init
./deploy/scripts/compose.sh logs -f backend
./deploy/scripts/compose.sh logs -f edge
```

`db-init` 正常结束应为 `Exited (0)`。如果反复失败，先看 SQL 错误；常见原因是
`auth.users` 没建、数据库卷是旧的、或 public schema 权限不足。

## 8. 验证

```bash
curl -fsS https://linkmai.com/healthz
curl -fsS https://linkmai.com/api/health
```

浏览器打开 `https://linkmai.com`，注册账号，按邮件确认。第一个用户创建组织后即为 owner；
后续成员通过邀请加入。在设置里确认模型列表出现 `DeepSeek V4 Pro` / `DeepSeek Flash`。

再上传一个 PDF/DOCX，确认：

- 浏览器直接 PUT 到 `https://storage.linkmai.com/...` 返回 200；
- 文档能解析、能对话；
- 下载/预览正常。

## 9. 回滚

新栈出问题时，按“代码 → 数据 → 旧小程序”分层处理：

```bash
# 1) 先停新栈，释放 80/443
./deploy/scripts/compose.sh down

# 2) 代码回滚：在本地 checkout 上一个可用 commit，push 触发 GitHub Actions
git checkout <上一个可用 commit>
git push linkmai HEAD:feat/linkmai-rebrand

# 3) 数据回滚：从本机备份恢复 dump（先停 backend）
./deploy/scripts/compose.sh stop backend
docker exec -i linkmai-db-1 pg_restore -U postgres -d postgres --clean --if-exists < linkmai_production.dump
./deploy/scripts/compose.sh up -d
```

本机备份在仓库外的 `Linkmai-backups/20261125/`；服务器上不再保留旧备份。旧小程序服务
已经删除，不能原地 `pm2 start`；如果确实要恢复旧小程序，需要从 `source.tgz` 单独解包、
另找端口/域名部署，不能和当前 LinkMai 栈抢 80/443。

## 10. 文档协作：WPS

本次**不部署 Word 加载项**：`word` 容器、`word.linkmai.com`、word 证书和 auth handoff
都已从生产配置移除，证书只需要 `linkmai.com` + `www.linkmai.com` 两张。

WPS 侧目前没有现成集成：

- 仓库里的 `word-addin/` 基于 Microsoft Office.js，不能直接安装到 WPS。
- 现在可用的方式是“WPS 编辑 + 浏览器使用 LinkMai”：用户在 WPS 里打开/编辑文档，在
  `https://linkmai.com` 上传、审阅、对话，再下载回 WPS。
- 如果要做 WPS 侧边栏面板、直接读写当前文档，需要单独开发 WPS 加载项（WPS JS API +
  manifest + 文档适配层），可复用 LinkMai 的聊天 UI 和后端，但不属于本次部署范围。

## 11. 日常运维

```bash
./deploy/scripts/compose.sh ps
./deploy/scripts/compose.sh logs -f --tail=200 backend

# 更新代码
git pull
./deploy/scripts/compose.sh build
./deploy/scripts/compose.sh run --rm db-init
./deploy/scripts/compose.sh up -d

# 进入数据库
./deploy/scripts/compose.sh exec db psql -U postgres -d postgres
```

备份：

- 数据库在 Docker 卷 `db_data`，升级前用 `pg_dump` 备份，必要时给 ECS 打快照。
- OSS 开版本控制，按合规要求设生命周期。
- Redis 是队列，不是权威数据；PostgreSQL 才是。
- `deploy/.env.prod` 备份到密码管理器。丢失 JWT secret 会让所有会话失效；
  丢失 `USER_API_KEYS_ENCRYPTION_SECRET` 会导致用户自带 API Key 无法解密。

证书续期后 `docker compose ... exec edge nginx -s reload`，不需要重启业务容器。

## 12. 排障

| 现象 | 排查 |
| --- | --- |
| `edge` 启动报 `address already in use` | 旧 Nginx/旧容器还占着 80/443；`ss -lntp` 查进程，先停旧服务 |
| `db-init` 报 `relation "auth.users" does not exist` | GoTrue 还没建表；看 `auth` 日志和 `db` 健康状态 |
| `permission denied for schema public` | `db-init` 不是以 `postgres` 执行，或数据库卷是旧的 |
| `must be owner of relation users` | `db-init` 没有用 `postgres` 超级用户执行 |
| backend 启动即退出，提示 secret 缺失 | 三个应用 secret 未生成或仍是占位符 |
| `PublicEndpointForbidden` | `OSS_PUBLIC_ENDPOINT` 用了 `*.aliyuncs.com`，改成 `https://storage.linkmai.com` |
| 上传 403 `SignatureDoesNotMatch` | 预签名 `Content-Type` 与浏览器实际发送不一致 |
| 上传 CORS 失败 | OSS CORS 的 AllowedOrigin 必须是精确的 apex 源，不能是 `*` |
| 登录邮件收不到 | SMTP、发信地址验证、SPF/DKIM；看 `auth` 日志 |
| SSE 不流式 | `edge` 的 `/api/` 必须 `proxy_buffering off` |
| 502 | `edge` 到 upstream 不通；`compose ps` 看 frontend/backend 是否 healthy |

## 13. 安全清单

- [ ] 数据库只走 Docker 内网；`5432` 不对公网开放。
- [ ] OSS 私有，RAM 用户只有目标桶读写权限；AccessKey 不进 git。
- [ ] `deploy/.env.prod` 权限 600，已加入 `.gitignore`。
- [ ] 安全组只开 `22`（限制来源 IP）、`80`、`443`。
- [ ] 旧小程序数据库/OSS 备份已离线保存，确认不再回滚后再清理。
- [ ] `GOTRUE_DISABLE_SIGNUP` 按业务决定；对外服务建议邀请制。
- [ ] 定期更新基础镜像与依赖；关注 `npm audit` 和上游安全公告。

## 文件索引

| 文件 | 用途 |
| --- | --- |
| `docker-compose.prod.yml` | 生产服务编排 |
| `edge/nginx.conf` | TLS、域名路由、SSE |
| `env.prod.example` | 环境变量模板 |
| `db/init-roles.sh` | 本机 PostgreSQL 角色密码初始化 |
| `rds/bootstrap.sql` | 可选：外部 RDS 角色初始化 |
| `scripts/bootstrap-rds.sh` | 执行 bootstrap.sql |
| `scripts/generate-secrets.mjs` | 生成 `.env.prod` 与 JWT |
| `scripts/compose.sh` | 固定 env/compose 的启动入口 |
| `scripts/preflight-reuse.sh` | 复用旧 ECS 前的只读检查 |
| `oss/cors.json` | OSS 跨域规则 |
| `oss/README.md` | OSS 桶、自定义域、RAM |
| `certs/README.md` | 证书放置与续期 |
