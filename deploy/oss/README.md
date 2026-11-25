# 阿里云 OSS 配置

LinkMai 使用 OSS 原生 SDK（`backend/src/lib/storage/oss.ts`），不是 S3 兼容层。
原因是 OSS 不支持 path-style，而原有 S3 adapter 写死了 `forcePathStyle: true`；
并且 2025-03-20 之后，中国大陆新桶通过默认公网 endpoint（`*.aliyuncs.com`）访问数据
会被拒绝，错误为 `PublicEndpointForbidden`（HTTP 400，EC 0048-00000401）。因此浏览器
必须走绑定到桶的自定义域名 `storage.linkmai.com`。

## 1. 创建桶

控制台 → OSS → 创建 Bucket：

| 项 | 值 |
| --- | --- |
| 地域 | 与 ECS/RDS 相同，例如 `cn-hangzhou` |
| 名称 | `linkmai-prod`（全局唯一，可换） |
| 读写权限 | **私有** |
| 版本控制 | 按需开启（建议开启，误删可恢复） |
| 加密 | 可选 SSE-OSS |

不要开启公共读。文件访问全部通过后端签发的预签名 URL。

## 2. 绑定自定义域名

桶 → 传输管理 → 域名管理 → 绑定域名：

1. 输入 `storage.linkmai.com`。
2. 按提示在 DNS 添加 CNAME：`storage.linkmai.com` → `<bucket>.oss-cn-<region>.aliyuncs.com`。
3. 等待 OSS 显示「域名绑定成功」后再改 DNS（顺序反了会校验失败）。
4. 在同一页面为域名开启 HTTPS，上传证书（阿里云免费证书或已有证书）。
5. 不要使用通配符域名；OSS 自定义域名不支持通配符。

> 域名必须先完成 ICP 备案。`linkmai.com` 已在阿里云备案，新增子域不需要再备案。

验证 TLS 和 Host 路由：

```bash
curl -sI https://storage.linkmai.com/ | head
# 私有桶返回 403 是正常的；能完成 TLS 握手并返回 OSS 错误码即说明域名映射成功。
```

## 3. 配置 CORS

桶 → 数据安全 → 跨域设置 → 创建规则，或使用 ossutil：

```bash
ossutil cors --method put oss://linkmai-prod deploy/oss/cors.json
```

规则内容见 `deploy/oss/cors.json`：允许 `https://linkmai.com`，方法
GET/PUT/POST/HEAD/DELETE，请求头 `*`，暴露 `ETag` 与 `x-oss-request-id`，缓存 1 小时。

验证预检：

```bash
curl -i -X OPTIONS https://storage.linkmai.com/probe \
  -H 'Origin: https://linkmai.com' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: content-type'
```

响应应包含 `Access-Control-Allow-Origin: https://linkmai.com`。不要用 `*`：
浏览器上传带 Cookie/凭据时通配符会被拒绝。

## 4. 创建 RAM 用户

只给后端进程使用，不要给浏览器。权限策略最小化：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:GetObjectMeta",
        "oss:DeleteObject",
        "oss:CopyObject",
        "oss:ListObjects",
        "oss:ListMultipartUploads",
        "oss:AbortMultipartUpload"
      ],
      "Resource": [
        "acs:oss:*:*:linkmai-prod",
        "acs:oss:*:*:linkmai-prod/*"
      ]
    }
  ]
}
```

创建 AccessKey 后填入 `deploy/.env.prod` 的 `OSS_ACCESS_KEY_ID` /
`OSS_ACCESS_KEY_SECRET`。建议使用 RAM 角色（ECS 实例角色）而不是长期 AccessKey；
当前 adapter 读取环境变量，若改用实例角色需要扩展代码，暂未实现。

## 5. 内网 endpoint

后端在 ECS 上，使用内网 endpoint，流量不走公网、不计公网流量费：

```dotenv
OSS_REGION=cn-hangzhou
OSS_INTERNAL=true
OSS_ENDPOINT=https://oss-cn-hangzhou-internal.aliyuncs.com
OSS_PUBLIC_ENDPOINT=https://storage.linkmai.com
```

`OSS_PUBLIC_ENDPOINT` 只用于生成浏览器预签名 URL，后端自身仍走内网 endpoint。

## 6. 验收清单

- [ ] 桶为私有，公共读关闭。
- [ ] `storage.linkmai.com` 在 OSS 显示绑定成功，HTTPS 可握手。
- [ ] CORS 预检返回精确 Origin，不是 `*`。
- [ ] `deploy/.env.prod` 的 endpoint 是内网地址，公网域是自定义域。
- [ ] 在应用里上传一个文件：浏览器 PUT 返回 200，随后预览/下载正常。
- [ ] 删除文件后，旧预签名 URL 立即 404（对象已删）。
- [ ] 后端日志没有 `PublicEndpointForbidden`、`SecondLevelDomainForbidden`。

## 常见错误

| 错误 | 原因 | 处理 |
| --- | --- | --- |
| `PublicEndpointForbidden` | 浏览器用了 `*.aliyuncs.com` | 设置 `OSS_PUBLIC_ENDPOINT=https://storage.linkmai.com` 并重建 backend |
| `SecondLevelDomainForbidden` | 用了 path-style 或二级域名直连 | 确认 adapter 使用 `cname: true`，且自定义域已绑定 |
| CORS 预检 403 | 规则里 Origin 不精确，或未允许 `content-type` | 按 `cors.json` 重建规则 |
| PUT 403 `SignatureDoesNotMatch` | 预签名时 Content-Type 与浏览器发送的不一致 | 上传请求必须带 `Content-Type`，且与 `signUpload` 返回的 header 完全一致 |
| `NoSuchKey` | 对象不存在或已被删除 | 正常 404 语义；检查上传是否真正完成 |
