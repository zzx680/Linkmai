# 部署指南

本文件是当前部署操作的统一入口。快速启动、云服务配置和功能文档只补充各自范围；日期记录、P1/P2 总结和旧交接文件不是当前发布步骤。最近核实日期：2026-10-28。

## 1. 发布顺序与当前缺口

```text
提交并固定 Git SHA
  → 开发机或 CI 构建、自动测试
  → 部署服务器 staging、接口检查
  → 小程序连接 staging，完成相关功能与真机验收
  → 确认同一 SHA、备份及审批
  → 部署 production、正式接口检查
  → 重新构建连接 production 的小程序、受控复验
  → 上传微信、提交审核、发布
```

- 默认在服务器 staging 测试后端；本地后端仅用于可选调试。本地构建通过不代表服务器或真机验收通过。
- staging 与 production 保持独立的进程、端口、环境文件、数据库、数据库账号和 JWT。同一台服务器可以同时运行两套环境。
- 验收后将同一 Git SHA 分别部署到 production；不将 staging 进程直接改名，不复制测试数据库、订单、用户或整份环境文件。
- 后端部署、小程序构建、上传微信、提交审核和正式发布是独立操作，按用户已授权范围执行；文档修改或代码提交本身不代表授权发布。
- 验收记录须包含 SHA、staging release、检查结果与人工验收范围。验收后修改代码或 staging 被其他版本覆盖，应重新核对受影响的功能。

**仓库工作流与脚本已补齐上述后端顺序，尚未提交、推送或在服务器执行。**

- checks → staging → production，production 沿用原有人工审批。等待审批期间工作流占用发布并发组，避免新工作流替换待验收 staging。
- 两环境使用同运行源码归档，核对校验和、SHA、release ID。ID 为 SHA-run_id-run_attempt，原子创建目录，拒绝覆盖。
- 服务器发布/回滚共用 flock 锁，安装、构建、测试、配置校验、迁移任一步失败即停止。切换后检查健康、功能、鉴权及实际进程版本。
- production 持锁核对 staging 当前成功 release 和实际进程 SHA。人工真机验收、迁移备份、兼容性仍由审批人核实。
- Nginx 模板补 /review/ 和 51 MiB 请求上限，线上尚未应用；高权限和共享 OSS 隔离仍待后续变更。

首次启用前配置第 6 节 staging Secrets，审查 Nginx 差异。范围及限制见[核查报告](DEPLOYMENT_AUDIT_2026-10-28.md)。

## 2. 已核实的环境与账号

以下是 2026-10-28 SSH 只读检查快照；后续发布仍应确认运行状态，不用旧记录代替实时检查。

| 项目 | staging | production |
| --- | --- | --- |
| API 域名 | `https://staging-api.linkmai.com/api` | `https://api.linkmai.com/api` |
| 后端端口 | `127.0.0.1:8100` | `127.0.0.1:8200` |
| 进程名 | `linkmai-staging-api` | `linkmai-production-api` |
| 发布目录 | `/var/www/linkmai-staging` | `/var/www/linkmai-production` |
| 环境文件 | `/etc/linkmai/staging.env` | `/etc/linkmai/production.env` |
| 数据库 | 本机 PostgreSQL，独立测试库与账号 | 本机 PostgreSQL，独立正式库与账号 |
| 数据库连接 | loopback，`POSTGRES_SSL=false` | loopback，`POSTGRES_SSL=false` |
| 支付配置 | 微信支付，1 分 | 微信支付，4990 分 |
| 小程序输出 | `miniprogram/dist-staging/` | `miniprogram/dist/` |

Nginx 已配置上述域名分别转发至 8100、8200；检查配置不等于已完成 TLS、接口或业务验收。两环境数据库目标、账号和 JWT 不同，但 OSS Bucket 相同，不能宣称存储完全隔离。2026-10-17 记录了负责人允许复用部分外部服务凭据；共享资源的清理、生命周期和权限变化必须核对对两环境的影响，不得对共享 Bucket 整体清理。后续资源隔离单独安排，不在发布时静默切换。

### SSH 与 PM2

日常 SSH 登录和 GitHub Actions 部署均使用独立的密钥与账户。连接参数和私钥路径只保留在本机受控运维配置及 GitHub Environment Secrets 中，不写入仓库文档。始终启用 `IdentitiesOnly=yes` 和严格主机密钥校验；不要关闭主机校验，不要将私钥提交 Git 或粘贴到聊天。

发布根目录归 root 管理；PM2 daemon 归 root 管理，Node 进程以无登录 shell 的 `linkmai` 账号运行。当前 Actions 部署账户具有所需的免密 sudo 权限；若要收紧权限，须先设计并测试部署入口，不能直接替换发布账户。

阿里云服务器终端只读查看现有进程（不切换到 admin 的另一套 PM2）：

```bash
sudo -n env PM2_HOME=/root/.pm2 pm2 status
sudo -n env PM2_HOME=/root/.pm2 pm2 logs linkmai-staging-api --lines 50 --nostream
```

## 3. 构建与自动检查

Mac 本地终端或 CI，从仓库根目录执行。已有依赖时不重复安装；干净检出使用锁文件安装依赖：

```bash
npm --prefix server ci
npm --prefix miniprogram ci
npm --prefix server run build
npm --prefix server run lint
DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DB_TYPE=memory npm --prefix server test
./miniprogram/node_modules/.bin/tsc --noEmit -p miniprogram/tsconfig.json
DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DB_TYPE=memory ./server/node_modules/.bin/tsx --test miniprogram/tests/*.test.ts
```

测试须与发布 SHA 对应。PostgreSQL 专项可能因缺少显式开关而跳过，不能将跳过视为通过；涉及事务、迁移和并发的改动需使用独立可清理测试库补验，禁止对 staging 业务库或生产库运行清表型测试。迁移原则见[数据库迁移](../MIGRATION.md)。

## 4. 服务器配置与首次准备

现有服务器已运行服务，日常发布不重复安装系统、重建数据库、覆盖环境文件、运行 `pm2 startup` 或重配 Nginx。新服务器才按实际资源方案准备 Nginx、Node/npm、PM2、rsync、curl 和证书工具；运行时版本与锁文件在 staging 验证后确定，升级运行时作为独立变更。

### 数据库与资源

当前使用本机 PostgreSQL，不要求先迁移到 RDS。若改用远程 PostgreSQL/RDS，需单独准备网络访问、独立库与最小权限账号，配置 `POSTGRES_SSL=true` 和 `POSTGRES_SSL_CA_FILE`，验证证书后再切换。当前配置校验允许 loopback 数据库不启用 TLS；不能将这一例外用于远程数据库。

构建会占用共享服务器 CPU/内存，应观察负载，避免两环境同时构建。脚本阈值只是最低检查，不是容量承诺；是否扩容、增加 swap 或迁移数据库应结合实际负载，不在日常部署中自动执行。

### 环境文件和密钥权限

环境模板为 `server/.env.staging.example`、`server/.env.production.example`，只用于新建文件时逐项参考；**不要用模板覆盖已有配置**。设置 `NODE_ENV`、`HOST=127.0.0.1`、对应端口及独立数据库/JWT。staging 模板的支付 provider 默认是 `disabled`；启用真实支付时才设为 `wechat` 并配置完整商户密钥，production 必须使用 `wechat`。

服务端配置以 `server/src/config/index.ts` 为准。微信 AppSecret、数据库密码、云服务和模型密钥只放目标环境配置或受限文件，客户端只接收公开 API 地址。

当前环境文件为 `root:linkmai`、640，父目录为 `root:linkmai`、750；服务账号需要读取配置及其引用的密钥文件，并穿越父目录。不要统一改成 root 独占的 600/700，导致 `linkmai` 无法读取。示例只用于已确认路径的权限修复，在阿里云服务器终端执行：

```bash
sudo chown root:linkmai /etc/linkmai /etc/linkmai/staging.env /etc/linkmai/production.env
sudo chmod 750 /etc/linkmai
sudo chmod 640 /etc/linkmai/staging.env /etc/linkmai/production.env
```

引用密钥文件同样按所需服务账号授权；只修改已确认文件，不对整个 secrets 目录盲目递归覆盖权限。文件型配置包括 `WECHAT_MCH_PRIVATE_KEY_FILE`、`WECHAT_API_V3_KEY_FILE`、`WECHAT_PAY_PUBLIC_KEY_FILE` 和远程库的 `POSTGRES_SSL_CA_FILE`。详情见[云服务配置](ALIYUN_SETUP.md)。

### Nginx 与 HTTPS

新站点先参考 `server/deploy/nginx-*-bootstrap.conf`，替换域名并签发证书，再使用对应完整模板。已有站点保留实际配置并审查差异，不直接覆盖。

- staging `/api/` 转发 8100；production `/api/` 转发 8200，保留请求 Host 和转发协议。
- 配置上传限制时需为 multipart 请求留余量；后端图片上限 10 MiB，视频上限 50 MiB，两模板已统一为 51m；线上上限仍需核实，模板修改不代表已生效。
- 律师审核功能需要 `/review/` 静态页转发及 `/api/review/` API；模板已补前者；同日先前只读检查发现线上尚缺，需审查配置、nginx -t/reload 并在 staging 验证。启用审核功能时 smoke 要求页面 200。
- 每次配置变更先执行 `sudo nginx -t`，通过后才 reload。TLS 证书和微信 request/uploadFile 合法域名须与实际目标一致。

## 5. staging 部署与验收

日常优先使用第 6 节工作流。以下为手工发布约定，不能绕过固定版本、目标隔离和验收。

1. 从固定 Git SHA 的干净源码快照同步到独立候选目录；排除 `.git`、环境文件、支付密钥、工具缓存、`node_modules` 和构建产物。不要同步开发机的整个脏工作区，也不要覆盖 `current`。
2. 候选源码可由 `admin` 写入；release 和日志权限由受控部署命令处理。发布过程使用 root 的 PM2，Node 仍由 `linkmai` 运行。
3. 同一环境串行部署，不在共享候选目录边覆盖源码边构建。每次尝试使用新 release ID，记录其 Git SHA；脚本拒绝已有 release ID，重试使用新编号。
4. 安装、构建、测试、配置校验和迁移任何一步失败都应终止，不切换 `current`；脚本已按此停止，失败路径由回归覆盖。

从已提交 SHA 导出干净源码快照，将完整 SHA 写入快照根目录 .release-source-sha 后同步至候选目录；Actions 自动完成。不要给脏工作区随意标记 SHA。以下在阿里云终端运行，先替换占位值：

```bash
sudo -n env PM2_HOME=/root/.pm2 \
  RELEASE_ID='<唯一发布编号>' \
  RELEASE_SHA='<40位已提交SHA>' \
  SOURCE_ROOT='/var/www/linkmai-staging/source/<已提交SHA>' \
  LINKMAI_ENV_FILE=/etc/linkmai/staging.env \
  LINKMAI_HEALTH_URL=https://staging-api.linkmai.com/api/health \
  bash '/var/www/linkmai-staging/source/<已提交SHA>/server/scripts/deploy-staging.sh'
```

接口 smoke 可在 Mac 本地终端或 CI 从仓库根目录执行，不创建订单或扣款：

```bash
bash server/scripts/smoke-staging.sh https://staging-api.linkmai.com
```

随后构建连接 staging 的小程序（Mac 本地终端或 CI）：

```bash
TARO_APP_API_BASE=https://staging-api.linkmai.com/api npm --prefix miniprogram run build:weapp:staging
```

将 `miniprogram/dist-staging/` 作为独立项目导入微信开发者工具；不改根项目的 `miniprogramRoot`，不使用关闭域名/TLS 校验代替 HTTPS 和合法域名配置。`NODE_ENV=production` 在此构建脚本中表示优化编译，实际后端由 `TARO_APP_API_BASE` 决定。

根据改动验收登录、案件、材料上传/OCR、字段确认、报告、订单恢复和退款等流程。微信登录、语音、支付须真机测试；真实扣款前确认账号和测试金额。staging 当前 1 分也是实际交易，不是 mock。记录 SHA、release、测试结果及未覆盖项，不能只凭 health 200 放行。

## 6. GitHub Actions 与 production

工作流 .github/workflows/deploy-production.yml 在推送 main 或手动触发时运行。checks 只允许 main，手动选择其他分支将跳过发布；以触发运行固定的提交为准。

1. **checks**：Node 22、锁文件安装、后端构建/lint/测试、小程序类型检查/测试及 staging 编译；创建固定 SHA 源码归档和验收包。
2. **staging**：下载本运行源码，核对校验和与 metadata，部署独立候选目录，自动检查数据库、功能、鉴权和实际运行 SHA/release；Summary 记录验收要求。
3. **人工验收**：下载当前运行的 weapp-staging-<release ID> Artifact，解压后直接导入（包内有 project.config.json 与 release.json），核对包内版本、AppID 和 staging API，再完成相关功能及真机测试；记录 SHA、release、通过/未覆盖项、金额、迁移备份和兼容性。smoke 不能代替业务验收。
4. **production**：负责人验收后批准；job 依赖 staging 成功，下载相同源码。服务器持锁核对 staging 仍为本次成功版本且实际进程相符，再部署 production。之后构建正式 API 小程序，提供 weapp-production-<release ID> Artifact；不会自动上传微信或提交审核。

production Environment 已设置 zzx680 审批、允许自审并保留管理员手动绕过权限，继续沿用；绕过仍需履行验收责任。本次未修改或重新核实 GitHub 侧规则，审批不代替 staging 依赖/版本检查。

在 **staging** Environment 添加五项 Secrets；production 原五项继续使用：

| staging Secret | production Secret | 用途 |
| --- | --- | --- |
| STAGING_SSH_HOST | PROD_SSH_HOST | staging/production 对应的部署主机 |
| STAGING_SSH_PORT | PROD_SSH_PORT | SSH 端口 |
| STAGING_SSH_USER | PROD_SSH_USER | 专用部署账户 |
| STAGING_SSH_PRIVATE_KEY | PROD_SSH_PRIVATE_KEY | 专用部署私钥完整内容 |
| STAGING_SSH_KNOWN_HOSTS | PROD_SSH_KNOWN_HOSTS | 已核实的 known_hosts 主机公钥 |

同机同账号，可在负责人确认后将现有专用 Actions 密钥分别配置到两环境，或为 staging 单独生成密钥并追加公钥；不覆盖已有 authorized_keys。不隐式回退读取 production 凭据，缺 staging Secrets 会失败。Environment variables 可留空，当前没有读取 vars。业务密钥仍分别来自 /etc/linkmai/staging.env 和 /etc/linkmai/production.env。

authorized_keys 放登录公钥，GitHub Secret 放对应私钥，known_hosts 放服务器主机公钥，不要混用。私钥不写文档、Git 或聊天。runner 临时受限目录保存密钥并于结束清理；同步排除环境文件、密钥、依赖、构建和工具缓存。

服务器须有 flock（Ubuntu util-linux）、GNU coreutils/find、rsync、curl、Node/npm、现有 root PM2。源码由 admin 写入，release 由 root 管理，以 linkmai 运行。仍依赖免密 sudo 且 root 执行安装/构建，不是最小权限方案。**仅支持同机两环境**；分机须改造 staging 证明检查，不能仅修改 host Secrets。

ID 为 SHA-run_id-run_attempt。**只重跑 production 失败 job 可能复用 checks 旧输出，已有 release 会被拒绝覆盖；此时重跑整个工作流，重新 staging 验收和审批。** 首次启用须取消或拒绝旧版待审批部署，避免混用；本次未替用户审批、取消或执行远程任务。

本地测试不代表 Actions 已生效；需配置 staging Secrets，提交并推送后启用。人工审批和线上模板应用仍需实测。代码回滚不撤销数据库迁移，schema 变更须先独立库测试及兼容性/恢复演练。

## 7. 迁移与回滚

所有数据库变更由 `server/migrations/` 和 `npm run db:migrate` 管理；不直接执行旧 `init-db.sql` 代替迁移，不修改已应用文件。脚本已包含迁移，正常部署不再重复手工执行。

每次涉及迁移的正式发布，记录对应环境备份、恢复验证和迁移兼容性。当前为本机 PostgreSQL，使用对应实例的备份方案；只有采用 RDS 时才使用 RDS 快照，不把未部署的 RDS 当作发布前置事实。

代码回滚不会恢复 schema、订单、付款或权益；不兼容迁移须执行已演练的恢复处置。回滚目标须是明确核实的兼容 release，不能单纯按目录时间取“第二新”。经授权后在阿里云服务器终端执行，例如：

```bash
sudo -n env PM2_HOME=/root/.pm2 \
  LINKMAI_ENV_FILE=/etc/linkmai/production.env \
  bash /var/www/linkmai-production/current/server/scripts/rollback-production.sh \
  '/var/www/linkmai-production/releases/<已核实的兼容release>'
```

回滚默认使用发布记录的 previous 链接，不猜目录时间；旧部署无记录时须显式目标。持同一锁，自动 health/smoke，有 metadata 时校验 SHA/release；失败恢复原版本并再次检查。仍需核对数据库兼容性与业务。

## 8. 正式小程序与运维

后端正式检查通过后，在 Mac 本地终端或 CI 从仓库根目录重新构建：

```bash
TARO_APP_API_BASE=https://api.linkmai.com/api npm --prefix miniprogram run build:weapp
```

根目录 `project.config.json` 指向 `miniprogram/dist/`，与本地可选监听构建共用输出目录；正式构建前停止 `dev:weapp`，防止产物互相覆盖。核对最终包的 API 地址、AppID 和版本；上传微信不会自动把 staging 地址改成 production。构建、上传和提交审核依次核实结果。

大范围取消/失败/回调异常和业务功能先在 staging 验证；正式环境仅做已授权的受控复验。不得为了测试临时将正式价格改成 1 分、开启 mock 或导入合成订单。真实付款与退款按明确授权操作，客户端成功提示不能代替后端验签和订单/权益确认。

上线后观察 health、5xx、数据库连接、进程内存、磁盘、订单/回调异常；保留发布 SHA、release、迁移、验收及回滚记录。日志不写密钥、token、签名 URL 或完整敏感材料。备份、日志轮换、告警和恢复演练按实际部署资源维护。

## 9. 补充文档

- [快速开始](../../QUICKSTART.md)：默认 staging 联调，本地后端可选。
- [后端入口](../README.md)、[数据库迁移](../MIGRATION.md)。
- [云服务配置](ALIYUN_SETUP.md)、[OSS 当前上传链路](OSS_INTEGRATION.md)。
- [案件计算、文书与律师审核运维](CASE_WORKFLOW_OPERATIONS.md)：功能开关、审核账号、规则导入及专项验收。
- [数据申请处理](PRIVACY_REQUESTS.md)、[语音输入](../../miniprogram/src/services/speech/README.md)。
- [部署文档核查](DEPLOYMENT_AUDIT_2026-10-28.md)：本次修复范围及待应用配置。

日期命名的发布、审查和反馈文档只说明当时状态，不作为最新发布批准。历史记录中针对旧 Python 服务的流量回退、旧迁移版本和旧构建命令不得直接套用到当前版本。
