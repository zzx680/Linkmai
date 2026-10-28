# 云服务配置

本文件补充 OSS/OCR 等配置，不替代[部署指南](DEPLOYMENT.md)。配置项以 `server/src/config/index.ts` 为准，页面位置、权限范围和费用以供应商控制台为准；不保留未经复核的固定价格或成本承诺。

## 环境配置位置

| 环境 | 配置位置 |
| --- | --- |
| 可选本地调试 | `server/.env` 或明确指定的本地测试环境文件 |
| staging | `/etc/linkmai/staging.env` |
| production | `/etc/linkmai/production.env` |

服务使用 `DOTENV_CONFIG_PATH` 读取对应文件；服务器日常发布不依赖仓库内 `.env`。配置和引用密钥文件须能被 `linkmai` 服务账号读取，权限约定见部署指南；不将 AppSecret 或云服务密钥写入小程序构建变量。

## OSS

- Bucket 和对象保持私有，区域与实际资源一致；使用专用 RAM 身份并仅授予所需操作和对象范围，不使用主账号长期 AccessKey。
- 当前两环境共用 Bucket 是已有例外，不能宣称对象完全隔离；测试清理不能误删正式材料，变更权限和生命周期时核对共享影响。新资源优先按环境隔离。
- 小程序当前将文件上传到自己的后端，再由后端写 OSS；不要套用旧文档的“向客户端返回长期 AccessKey”方案。具体接口见[OSS 集成](OSS_INTEGRATION.md)。

```dotenv
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=<对应Bucket>
ALIYUN_OSS_ACCESS_KEY_ID=<服务端专用RAM凭据>
ALIYUN_OSS_ACCESS_KEY_SECRET=<服务端专用RAM凭据>
```

Bucket 名称与区域填写实际值，不因示例名称创建重复生产资源。当前后端代理上传不要求为了小程序上传而开放浏览器跨域直传；若另行启用 H5/OSS 直传，单独验证 CORS 和临时授权方案。

## OCR 与模型服务

OCR 的配置名称为：

```dotenv
ALIYUN_OCR_ACCESS_KEY_ID=<服务端凭据>
ALIYUN_OCR_ACCESS_KEY_SECRET=<服务端凭据>
ALIYUN_OCR_ENDPOINT=<实际开通且已验证的Endpoint>
```

DeepSeek 使用 `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`（兼容 `DEEPSEEK_API_BASE`）和 `DEEPSEEK_MODEL`；旧 `DEEPSEEK_BASE_URL` 不由当前配置读取。第三方兼容 API 必须在 staging 验证模型、格式、超时与失败处理，再更新对应环境配置，不能只凭基础请求成功认定业务通过。

口述输入使用腾讯微信同声传译插件，当前未接入阿里云 NLS；不为此功能新增 NLS AppKey。插件授权和验收见[语音输入](../../miniprogram/src/services/speech/README.md)。

## 微信域名与支付

按实际调用配置微信合法域名：

- staging request/uploadFile：`https://staging-api.linkmai.com`。
- production request/uploadFile：`https://api.linkmai.com`。
- 图片展示、预览或下载若使用 OSS 签名域名，再根据实际 API 配置相应域名；不因后端上传就将 uploadFile 域名只填成 OSS。

不要通过关闭合法域名、TLS 或证书校验替代配置。微信登录的 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`、商户关联和支付回调须与实际小程序及目标环境一致。支付回调路径为 `/api/payments/wechat/notify`，staging 与 production 使用各自域名。

完整商户配置名称见 `.env.staging.example` / `.env.production.example` 和配置校验函数；引用密钥文件不得只允许 root 读取而阻止应用账号。staging 默认为禁用支付的模板，开启 `wechat` 后是真实支付，不是沙箱；实际扣款先确认账号、金额和授权。

## 验证范围

先核对目标资源、配置名称和权限，再在 staging 验证登录、上传后私有对象可按权限访问、OCR 和模型服务。health 200 不能证明这些外部服务可用；不为验证连接而列出整个共享 Bucket 或把完整对象列表、签名 URL、密钥写入日志。
