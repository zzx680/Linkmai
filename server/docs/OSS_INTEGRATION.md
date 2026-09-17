# OSS 集成使用指南

## 1. 配置 OSS

### 创建 Bucket

1. 登录阿里云 OSS 控制台：https://oss.console.aliyun.com/
2. 点击"创建 Bucket"
3. 配置：
   - **Bucket 名称**：`linkmai-accident-files`（或其他全局唯一名称）
   - **地域**：`华东1（杭州）`
   - **读写权限**：**私有**
   - **存储类型**：标准存储
4. 创建后，记录 Bucket 名称

### 配置 CORS

进入 Bucket → 权限管理 → 跨域设置 → 创建规则：

- **来源**：`https://servicewechat.com`
- **允许 Methods**：`GET`, `POST`, `PUT`, `HEAD`
- **允许 Headers**：`*`
- **暴露 Headers**：`ETag`, `x-oss-request-id`

### 获取 AccessKey

1. 右上角头像 → AccessKey 管理：https://ram.console.aliyun.com/manage/ak
2. 点击"创建 AccessKey"
3. **重要**：立即复制并保存 AccessKey ID 和 AccessKey Secret

### 填入配置

编辑 `/Users/charlie/灵迈/server/.env`，填入你的配置：

```bash
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=linkmai-accident-files  # 你的 Bucket 名称
ALIYUN_ACCESS_KEY_ID=LTAI...              # 你的 AccessKey ID
ALIYUN_ACCESS_KEY_SECRET=...              # 你的 AccessKey Secret
```

---

## 2. 启动服务

```bash
cd /Users/charlie/灵迈/server

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

---

## 3. API 使用示例

### 获取上传凭证

```bash
curl -X POST http://localhost:8000/api/files/presign \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "accident-photo.jpg",
    "fileType": "scene-photo",
    "caseId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

响应：

```json
{
  "success": true,
  "data": {
    "objectKey": "cases/mock-user-id/550e8400.../scene-photo/1234567890-abc123.jpg",
    "region": "oss-cn-hangzhou",
    "bucket": "linkmai-accident-files",
    "accessKeyId": "LTAI...",
    "accessKeySecret": "...",
    "expiration": 1735123456789
  }
}
```

### 前端直传示例（Taro）

```typescript
import Taro from '@tarojs/taro'
import OSS from 'ali-oss'

async function uploadFile(filePath: string) {
  // 1. 获取上传凭证
  const { data } = await Taro.request({
    url: 'https://api.linkmai.com/api/files/presign',
    method: 'POST',
    data: {
      filename: 'accident-photo.jpg',
      fileType: 'scene-photo',
      caseId: currentCaseId,
    },
  })

  // 2. 创建 OSS 客户端
  const client = new OSS({
    region: data.region,
    accessKeyId: data.accessKeyId,
    accessKeySecret: data.accessKeySecret,
    bucket: data.bucket,
  })

  // 3. 读取文件并上传
  const fs = Taro.getFileSystemManager()
  const fileData = fs.readFileSync(filePath)

  await client.put(data.objectKey, fileData)

  // 4. 通知后端上传完成
  await Taro.request({
    url: 'https://api.linkmai.com/api/files/confirm',
    method: 'POST',
    data: {
      objectKey: data.objectKey,
      caseId: currentCaseId,
      fileType: 'scene-photo',
    },
  })
}
```

---

## 4. 文件类型

`FileType` 枚举定义在 `src/services/oss.ts`：

- `police-report` - 交警认定书
- `medical` - 医疗材料
- `invoice` - 费用票据
- `vehicle-damage` - 车损材料
- `scene-photo` - 现场照片
- `dashcam` - 行车记录仪
- `other` - 其他

---

## 5. 服务端函数

### `getUploadCredentials()`

返回上传凭证（MVP 阶段返回主账号凭证，生产环境应使用 STS）

### `getSignedUrl()`

生成临时下载链接（1 小时有效）

### `uploadFile()`

后端直接上传文件（用于生成报告等场景）

### `deleteFile()` / `deleteFiles()`

删除单个或批量文件

### `fileExists()`

检查文件是否存在

### `getFileMeta()`

获取文件元信息（大小、类型、修改时间）

---

## 6. 安全建议

- ✅ Bucket 设置为"私有"
- ✅ 通过签名 URL 访问文件
- ✅ 生产环境使用 STS 临时凭证
- ✅ `.env` 文件已在 `.gitignore` 中
- ❌ 不要将 AccessKey 提交到 Git
- ❌ 不要设置 Bucket 为"公共读"

---

## 7. 下一步

配置完成后，你可以：

1. 测试健康检查：`curl http://localhost:8000/api/health`
2. 测试获取上传凭证（见上文 API 示例）
3. 开始实现前端上传组件
4. 集成 OCR 和文件分类服务
