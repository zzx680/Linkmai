# 阿里云服务开通指南

## 1. 开通 OSS 对象存储

### 步骤 1：开通服务
1. 登录阿里云控制台：https://oss.console.aliyun.com/
2. 点击"立即开通"（如果还没开通）
3. 选择"按量付费"模式（用多少付多少，适合初期）

### 步骤 2：创建 Bucket
1. 进入 OSS 控制台
2. 点击"创建 Bucket"
3. 配置：
   - **Bucket 名称**：`linkmai-prod`（全局唯一，如果被占用就加后缀）
   - **地域**：`华东1（杭州）`（与你的服务器同地域，速度快）
   - **存储类型**：`标准存储`
   - **读写权限**：`私有`（重要！防止别人直接访问）
   - **服务端加密**：不启用（可选）
4. 点击"确定"

### 步骤 3：配置跨域访问（CORS）
1. 进入 Bucket 管理页
2. 点击"权限管理" → "跨域设置"
3. 点击"创建规则"：
   - **来源**：`https://servicewechat.com`（微信小程序域名）
   - **允许 Methods**：勾选 `GET`、`POST`、`PUT`、`HEAD`
   - **允许 Headers**：`*`
   - **暴露 Headers**：留空
4. 保存

### 步骤 4：创建 AccessKey
1. 点击右上角头像 → "AccessKey 管理"：https://ram.console.aliyun.com/manage/ak
2. 点击"创建 AccessKey"
3. **重要**：下载并保存好，只显示一次！
   - `AccessKey ID`：格式 `LTAI...`
   - `AccessKey Secret`：保密信息

### 步骤 5：配置到项目
将以下信息填入 `/Users/charlie/灵迈/server/.env`：

```bash
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=linkmai-prod  # 你创建的 bucket 名称
ALIYUN_ACCESS_KEY_ID=LTAI...     # 你的 AccessKey ID
ALIYUN_ACCESS_KEY_SECRET=...     # 你的 AccessKey Secret
```

---

## 2. 开通 OCR 文字识别（可选，后期再开）

### 步骤 1：开通服务
1. 访问：https://ocr.console.aliyun.com/
2. 点击"立即开通"
3. 选择"按量付费"

### 步骤 2：获取 Endpoint
- 地域选择：`华东1（杭州）`
- Endpoint：`ocr-api.cn-hangzhou.aliyuncs.com`

### 步骤 3：配置到项目
```bash
ALIYUN_OCR_ENDPOINT=ocr-api.cn-hangzhou.aliyuncs.com
```

---

## 3. 开通 NLS 智能语音（可选，后期再开）

### 步骤 1：开通服务
1. 访问：https://nls-portal.console.aliyun.com/
2. 点击"立即开通"

### 步骤 2：创建项目
1. 点击"项目管理" → "创建项目"
2. 项目名称：`linkmai-voice`
3. 获取 `AppKey`

### 步骤 3：配置到项目
```bash
ALIYUN_NLS_APP_KEY=your_app_key
```

---

## 4. 配置微信小程序服务器域名

开通 OSS 后，需要在微信公众平台添加白名单：

1. 登录微信公众平台：https://mp.weixin.qq.com/
2. 进入"开发管理" → "开发设置" → "服务器域名"
3. 添加以下域名：

**request 合法域名：**
```
https://api.linkmai.com
```

**uploadFile 合法域名：**
```
https://linkmai-prod.oss-cn-hangzhou.aliyuncs.com
```

**downloadFile 合法域名：**
```
https://linkmai-prod.oss-cn-hangzhou.aliyuncs.com
```

---

## 5. 验证配置

### 测试 OSS 连接
```bash
cd /Users/charlie/灵迈/server
node -e "
const OSS = require('ali-oss');
const client = new OSS({
  region: 'oss-cn-hangzhou',
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
});
client.list().then(console.log).catch(console.error);
"
```

如果输出 Bucket 信息，说明配置成功！

---

## 成本说明

### OSS 计费规则
- **存储费用**：￥0.12/GB/月
- **流量费用**：
  - 内网流出（ECS 访问）：免费
  - 外网流出（用户下载）：￥0.5/GB
  - 外网流入（上传）：免费
- **请求费用**：
  - PUT/POST：￥0.01/万次
  - GET：￥0.01/万次

### 预估成本（100 个案件/月）
```
存储：5GB × ￥0.12 = ￥0.6
流量：10GB × ￥0.5 = ￥5
请求：1 万次 × ￥0.01 = ￥0.1
━━━━━━━━━━━━━━━━━━━━
总计：约 ￥6/月
```

---

## 安全建议

1. **AccessKey 安全**
   - ❌ 不要提交到 Git
   - ✅ 使用 `.env` 文件（已在 `.gitignore` 中）
   - ✅ 定期轮换 AccessKey

2. **Bucket 权限**
   - ✅ 设置为"私有"
   - ✅ 通过后端签名 URL 访问
   - ❌ 不要设置为"公共读"

3. **防盗链**
   - 在 OSS 控制台设置"Referer 白名单"
   - 只允许 `servicewechat.com` 访问
