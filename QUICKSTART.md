# 快速开始

当前默认在服务器 staging 联调后端；本地后端仅作可选调试。完整发布顺序与服务器操作以[部署指南](server/docs/DEPLOYMENT.md)为准。

## 服务器 staging 联调

在 Mac 本地终端或 CI、仓库根目录执行：

```bash
npm --prefix miniprogram ci
TARO_APP_API_BASE=https://staging-api.linkmai.com/api npm --prefix miniprogram run build:weapp:staging
```

将 `miniprogram/dist-staging/` 作为独立项目导入微信开发者工具，确认 AppID 和合法域名配置。此命令只构建客户端，不部署或更新服务器。后端版本需按部署指南先发布并验证；不要仅凭现有 staging 可访问就认定它包含当前代码。

在 staging 验证改动涉及的页面与接口，微信登录、语音和支付进行真机验收。当前 staging 使用真实微信支付，1 分也会实际扣款；下单、付款和退款须在已授权范围内进行。

## 本地后端（可选）

Mac 本地终端，从仓库根目录执行：

```bash
npm --prefix server ci
DOTENV_CONFIG_PATH=/dev/null NODE_ENV=development DB_TYPE=memory PAYMENT_PROVIDER=mock ALLOW_MOCK_WECHAT_LOGIN=true HOST=127.0.0.1 PORT=8000 npm --prefix server run dev
```

在另一个 Mac 本地终端构建连接本机的客户端：

```bash
TARO_APP_API_BASE=http://localhost:8000/api npm --prefix miniprogram run dev:weapp
```

此时导入仓库根目录，根项目读取 `miniprogram/dist/`。localhost 用于开发者工具模拟器，手机无法通过 localhost 访问开发电脑；真机使用 staging HTTPS。不得在 staging/production 开启 mock 登录或 mock 支付。

上述启动命令跳过 `.env`，内存数据重启丢失，不包含真实云服务凭据。需要本地调试 OCR/OSS/AI 时，单独配置测试资源并明确加载配置；不要复制 production 环境文件。

本机健康检查：

```bash
curl --fail --show-error http://localhost:8000/api/health
```

返回 200 只说明基础服务和数据库检查通过，不证明上传、真实登录、支付或报告闭环已完成。

## 检查与发布

自动测试命令见[根 README](README.md#验证)。同一 Git SHA 经 staging 验收后再发布 production，正式客户端显式构建为正式 API；构建和上传微信是独立步骤。

- 配置项以 `server/src/config/index.ts` 与 `.env.*.example` 为准。
- PostgreSQL 初始化/升级统一使用[版本化迁移](server/MIGRATION.md)，不运行旧初始化 SQL 代替迁移。
- 云服务和文件上传分别见[云服务配置](server/docs/ALIYUN_SETUP.md)、[OSS 集成](server/docs/OSS_INTEGRATION.md)。
