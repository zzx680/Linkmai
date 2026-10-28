# OSS 当前上传链路

环境配置见[云服务配置](ALIYUN_SETUP.md)，发布步骤见[部署指南](DEPLOYMENT.md)。本文件已移除旧的客户端长期凭据直传示例。

## 实际调用

当前 `server/src/index.ts` 挂载 `/api/upload`；上传路由使用登录鉴权、案件归属检查和服务端 OSS 上传：

```text
小程序选择材料
  → 带登录凭证上传到目标后端
  → 后端检查文件和案件归属
  → 后端写入私有 OSS 对象并保存材料记录
  → 返回材料 ID、对象 key 和有时效的签名访问地址
```

| 接口 | 格式与限制 |
| --- | --- |
| `POST /api/upload/image` | multipart 字段 `file`；有效 JPG/PNG/WEBP，最多 10 MiB |
| `POST /api/upload/video` | multipart 字段 `file`；有效 MP4/MOV，最多 50 MiB |

接口要求 Bearer token 和用户已有案件；可提供 `caseId`，未提供时使用当前案件。材料识别与字段确认是后续业务步骤，上传成功不等于 OCR、确认或报告生成成功。

旧 `/api/files/presign`、`/api/files/confirm` 没有在当前服务入口挂载；不要按旧文档调用，也不要把底层 `getUploadCredentials()` 函数视为已开放 API。客户端不得取得服务端 AccessKey Secret。

## 服务端配置与访问

使用 `ALIYUN_OSS_REGION`、`ALIYUN_OSS_BUCKET`、`ALIYUN_OSS_ACCESS_KEY_ID`、`ALIYUN_OSS_ACCESS_KEY_SECRET`，不使用旧的无 `OSS_` 前缀变量。凭据仅放目标服务器环境文件；Bucket 和写入对象保持私有。

代码中的 `getSignedUrl()` 默认有效期为一小时；具体场景可传更短期限，律师审核材料链接使用单独的五分钟授权。签名 URL 是临时访问凭证，不应写入公开回复、日志或作为永久权限凭据。后端生成链接前仍需完成用户/案件或审核任务授权。

## staging 验收

1. 小程序显式连接 staging API，使用专用测试账号和合成材料；当前共享 Bucket 的清理仅限明确标识的测试对象。
2. 检查未登录和跨用户案件访问被拒绝，合法文件可上传，超限或错误格式被拒绝。
3. 检查私有对象不能匿名直接访问，经授权签名可读取；不要通过公开 Bucket 修复显示问题。
4. 检查 OCR、材料确认与报告后续链路；签名过期后重新授权，不保存长期公开链接。
5. 验证 Nginx 的 multipart 大小限制；视频 50 MiB 文件还需请求边界开销，当前 staging 模板的 `50m` 需要调整后验证。

以上验收不修改正式价格，不自动创建付款，也不整体清理共享存储。
