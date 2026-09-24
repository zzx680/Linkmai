# 灵迈小程序前端 UI 重做 — 后端对接说明

**目标读者**: 前端开发 agent  
**文档版本**: v1.0  
**最后更新**: 2026-09-19  
**后端分支**: backend  
**后端状态**: ✅ P1 核心功能已完成并验证

---

## 📋 项目背景

### 产品定位
灵迈：一站式交通事故处理服务小程序，用户通过 AI Agent 对话引导完成：
1. 材料收集（拍照上传）
2. 信息识别（OCR + AI 提取）
3. 事故分析（责任认定 + 赔偿估算）
4. 报告生成（法律建议 + 处理方案）

### 技术栈
- **前端**: 微信小程序（Taro 4 + React 18 + Zustand + SCSS）
- **后端**: Express + TypeScript + DeepSeek AI + 阿里云 OSS/OCR
- **认证**: JWT Bearer Token
- **风格**: Apple Design System

### 当前状态
- 后端 P1 核心功能已完成（15+ API 端点）
- TypeScript 构建通过，服务启动正常
- 所有接口已完成安全加固（JWT 认证 + 用户归属校验）
- 前端需要重做 UI 并对接后端真实接口

---

## 🔌 后端基础信息

### 服务地址
- **开发环境**: `http://localhost:8000`
- **API 前缀**: `/api`
- **健康检查**: `GET /api/health`

### 认证机制
- **方式**: JWT Bearer Token
- **登录接口**: `POST /api/auth/login`
- **Token 使用**: 所有需认证的接口需在请求头添加：
  ```
  Authorization: Bearer <token>
  ```
- **Token 过期**: 返回 `401 Unauthorized`，前端需引导重新登录

### 响应格式
**成功响应**:
```json
{
  "data": { ... },
  "message": "操作成功"  // 可选
}
```

**错误响应**:
```json
{
  "error": "ERROR_CODE",
  "message": "人类可读的错误信息"
}
```

**HTTP 状态码**:
- `200` - 成功
- `400` - 请求参数错误
- `401` - 未认证或 Token 过期
- `403` - 无权限访问该资源
- `404` - 资源不存在
- `500` - 服务器内部错误

---

## 🔐 1. 认证接口

### 微信小程序登录
```
POST /api/auth/login
```

**请求体**:
```json
{
  "code": "string"  // wx.login() 获得的 code
}
```

**响应**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "user_123456"
}
```

**前端职责**:
1. 小程序启动时调用 `wx.login()` 获取 code
2. 将 code 发送到后端换取 token
3. 存储 token（推荐 `wx.setStorageSync('token', token)`）
4. 后续所有请求携带 token

---

## 📂 2. 案件管理接口

### 业务规则
⚠️ **重要**: 每个用户同时只能有一个活跃案件（`status: 'active'`）

### 获取当前活跃案件
```
GET /api/cases/current
```

**响应**:
```json
{
  "id": "case_123",
  "userId": "user_123",
  "title": "2024年3月交通事故",
  "description": "红绿灯路口碰撞",
  "status": "active",  // active | archived
  "createdAt": "2026-09-19T10:00:00.000Z",
  "updatedAt": "2026-09-19T10:30:00.000Z",
  
  // 关联数据（可选，看后端实现）
  "conversation": { ... },
  "materials": [ ... ],
  "report": { ... }
}
```

### 创建案件
```
POST /api/cases
```

**请求体**:
```json
{
  "title": "string",        // 必需，案件标题
  "description": "string"   // 可选，案件描述
}
```

**响应**: 返回创建的案件对象

### 更新案件
```
PUT /api/cases/current
```

**请求体**: 部分更新字段
```json
{
  "title": "string",       // 可选
  "description": "string"  // 可选
}
```

**响应**: 返回更新后的案件对象

---

## 💬 3. Agent 对话接口（核心功能）

### 对话状态机
后端使用状态机管理对话流程，前端需要在 UI 中体现当前状态：

```
collecting   → 收集材料中（引导用户上传各类材料）
confirming   → 确认信息中（展示识别结果，等待用户确认）
analyzing    → AI 分析中（生成报告前的分析阶段）
ready        → 就绪（可以生成报告）
```

**UI 建议**: 顶部显示进度条或状态标签

### 获取对话历史
```
GET /api/conversations/current/messages
```

**响应**:
```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "assistant",  // 'user' | 'assistant' | 'system'
      "content": "您好！我是灵迈 AI 助手...",
      "images": [],
      "quickReplies": [
        { "text": "开始上传", "value": "start_upload" },
        { "text": "查看示例", "value": "show_example" }
      ],
      "timestamp": "2026-09-19T10:00:00.000Z"
    },
    {
      "id": "msg_002",
      "role": "user",
      "content": "开始上传",
      "images": [],
      "timestamp": "2026-09-19T10:01:00.000Z"
    }
  ],
  "conversationState": "collecting"
}
```

### 发送消息
```
POST /api/conversations/current/messages
```

**请求体**:
```json
{
  "content": "string",       // 必需，消息内容
  "images": ["string"],      // 可选，图片 URL 数组（已上传到 OSS）
  "metadata": { ... }        // 可选，额外元数据
}
```

**响应**:
```json
{
  "message": {
    "id": "msg_003",
    "role": "assistant",
    "content": "收到您的材料，正在识别...",
    "quickReplies": [
      { "text": "确认无误", "value": "confirm" },
      { "text": "重新上传", "value": "reupload" }
    ],
    "timestamp": "2026-09-19T10:02:00.000Z"
  },
  "conversationState": "confirming",
  "nextAction": "collect_media"  // 可选提示
}
```

### UI 设计要点

#### 对话界面
- 消息列表（用户消息右对齐，AI 消息左对齐）
- 支持图片消息展示（点击放大预览）
- **快捷回复按钮组**（必须渲染，用户高频操作）
  ```
  [ 确认无误 ] [ 需要修改 ] [ 重新上传 ]
  ```
- 输入框 + 发送按钮
- 图片上传按钮（相机/相册）
- AI 思考中加载动画

#### 状态显示
- 顶部显示当前对话状态
- `collecting`: 显示"正在收集材料 📸"
- `confirming`: 显示"等待确认 ✅"
- `analyzing`: 显示"AI 分析中 🤖"
- `ready`: 显示"可生成报告 📄"

#### 交互细节
- 用户发送消息后，立即显示用户气泡 + AI 思考中动画
- 收到 AI 回复后，逐字打字效果（可选）
- 快捷回复点击后，相当于用户发送一条消息（content = value）
- 图片上传成功后，自动发送消息携带图片 URL

---

## 📸 4. 材料处理接口

### 文件上传

#### 上传图片
```
POST /api/upload/image
Content-Type: multipart/form-data
```

**请求**: FormData，字段名 `image`

**响应**:
```json
{
  "url": "https://linkmai.oss-cn-hangzhou.aliyuncs.com/uploads/xxx.jpg",
  "key": "uploads/xxx.jpg"
}
```

#### 上传视频
```
POST /api/upload/video
Content-Type: multipart/form-data
```

**请求**: FormData，字段名 `video`

**响应**: 同上

**前端职责**:
1. 使用 `wx.chooseImage()` 或 `wx.chooseMedia()` 选择文件
2. 上传到后端获取 URL
3. 将 URL 传给材料处理接口或对话接口

### 单个材料处理
```
POST /api/materials/process
```

**请求体**:
```json
{
  "type": "accident_report",  // 材料类型，见下表
  "imageUrl": "https://...",  // 已上传的图片 URL
  "caseId": "case_123"        // 可选，默认使用当前活跃案件
}
```

**材料类型枚举**:
| type | 说明 | OCR 识别内容 |
|------|------|-------------|
| `accident_report` | 交警认定书 | 事故时间、地点、责任认定、双方信息 |
| `id_card` | 身份证 | 姓名、身份证号、地址 |
| `driver_license` | 驾驶证 | 姓名、驾驶证号、准驾车型 |
| `vehicle_license` | 行驶证 | 车牌号、车主姓名、车辆型号 |
| `medical_record` | 医疗记录 | 诊断结果、治疗费用 |
| `scene_photo` | 现场照片 | 车辆损坏情况描述 |
| `other` | 其他材料 | 通用文字识别 |

**响应**:
```json
{
  "material": {
    "id": "mat_001",
    "caseId": "case_123",
    "type": "accident_report",
    "imageUrl": "https://...",
    "ocrText": "原始 OCR 文本...",
    "extractedFields": {
      "accidentTime": "2024-03-15 14:30",
      "accidentLocation": "北京市朝阳区xxx路口",
      "liabilityRatio": "对方全责",
      "partyA": { "name": "张三", "plate": "京A12345" },
      "partyB": { "name": "李四", "plate": "京B67890" }
    },
    "confidence": 0.95,
    "status": "processed",
    "createdAt": "2026-09-19T10:05:00.000Z"
  },
  "suggestions": "建议核对事故时间和地点是否准确"
}
```

### 批量材料处理
```
POST /api/materials/batch-process
```

**请求体**:
```json
{
  "materials": [
    { "type": "accident_report", "imageUrl": "https://..." },
    { "type": "id_card", "imageUrl": "https://..." },
    { "type": "scene_photo", "imageUrl": "https://..." }
  ],
  "caseId": "case_123"  // 可选
}
```

**响应**:
```json
{
  "results": [
    { "material": { ... }, "success": true },
    { "material": { ... }, "success": true },
    { "error": "OCR 识别失败", "success": false }
  ]
}
```

### UI 设计要点

#### 材料上传页
- **材料类型选择器**（必选）：
  ```
  📄 交警认定书
  🪪 身份证
  🚗 行驶证
  📋 驾驶证
  🏥 医疗记录
  📸 现场照片
  📋 其他材料
  ```
- 拍照 / 相册选择按钮
- 上传进度条
- 缩略图预览（可删除、重新上传）

#### 材料列表页
- 按类型分组展示
- 每个材料卡片：
  - 缩略图
  - 类型标签
  - 处理状态图标（pending ⏳ / processed ✅ / failed ❌）
  - 点击查看详情

#### 字段确认页（关键交互）
- 显示 AI 提取的结构化字段
- **可编辑表单**（用户可修改错误识别）
- 置信度提示（< 0.8 时提示"请仔细核对"）
- 确认按钮 / 重新识别按钮

**示例布局**:
```
┌─────────────────────────┐
│ 交警认定书 - 识别结果    │
├─────────────────────────┤
│ 事故时间                │
│ [2024-03-15 14:30] ✏️   │
│                         │
│ 事故地点                │
│ [北京市朝阳区xxx路口] ✏️ │
│                         │
│ 责任认定                │
│ [对方全责] ✏️            │
│                         │
│ [ 确认无误 ] [ 重新识别 ] │
└─────────────────────────┘
```

---

## 📊 5. 报告接口

### 生成报告
```
POST /api/reports/generate
```

**请求体**:
```json
{
  "caseId": "case_123"  // 可选，默认使用当前活跃案件
}
```

**响应**:
```json
{
  "report": {
    "id": "report_001",
    "caseId": "case_123",
    "analysis": "根据您提供的材料，事故发生在...",
    "liability": "根据《道路交通安全法》第XX条...",
    "compensation": {
      "medical": 5000,
      "lostWages": 3000,
      "transportation": 500,
      "mentalDamage": 2000,
      "total": 10500
    },
    "legalAdvice": "建议您...",
    "suggestions": "下一步您可以...",
    "generatedAt": "2026-09-19T10:30:00.000Z"
  }
}
```

### 查询报告
```
GET /api/reports/:caseId
```

**响应**: 同上

### 导出报告（占位）
```
POST /api/reports/:caseId/export
```

**请求体**:
```json
{
  "format": "pdf"  // 'pdf' | 'word'
}
```

**响应**:
```json
{
  "downloadUrl": "https://linkmai.oss-cn-hangzhou.aliyuncs.com/reports/xxx.pdf",
  "expiresAt": "2026-09-19T11:00:00.000Z"
}
```

⚠️ **注意**: 导出功能后端目前是占位实现，前端可以先留入口按钮

### UI 设计要点

#### 报告生成页
- "生成报告" 大按钮
- 生成进度指示（约需 10-30 秒）
- 预估时间提示

#### 报告展示页
- **标题区**:
  - 案件标题
  - 案件编号
  - 生成时间

- **内容分段**:
  1. 📊 **事故分析**
     - 长文本，分段展示
  
  2. ⚖️ **责任认定**
     - 责任比例（饼图或进度条）
     - 法律依据引用
  
  3. 💰 **赔偿估算**
     - 明细列表：
       - 医疗费：¥5,000
       - 误工费：¥3,000
       - 交通费：¥500
       - 精神损害抚慰金：¥2,000
     - 总计：¥10,500（大字突出）
  
  4. 📖 **法律建议**
     - 分点展示
  
  5. 💡 **处理建议**
     - 下一步行动指南

- **操作按钮**:
  - [ 导出 PDF ]
  - [ 分享给律师 ]
  - [ 返回修改材料 ]

---

## 🗂️ 6. 页面结构建议

### Tab Bar（4 个主页面）

#### 1️⃣ Agent 对话 🤖
- **路径**: `/pages/agent/index`
- **核心功能**:
  - 对话消息列表
  - 快捷回复按钮
  - 图片上传
  - 对话状态显示
- **交互流程**:
  1. 进入页面，AI 自动打招呼
  2. 引导用户上传第一份材料（交警认定书）
  3. 识别后展示字段，用户确认
  4. 继续引导上传其他必需材料
  5. 材料收集完成，提示可生成报告

#### 2️⃣ 我的案件 📂
- **路径**: `/pages/case/index`
- **内容**:
  - 当前案件卡片（进度条、状态）
  - 材料清单（分类展示）
  - 报告入口（生成/查看）
  - 案件编辑按钮

#### 3️⃣ 律师咨询 👨‍⚖️
- **路径**: `/pages/consultation/index`
- **内容**（占位页面）:
  - 律师列表
  - 预约咨询（待开发）
  - 提示："功能开发中，敬请期待"

#### 4️⃣ 个人中心 👤
- **路径**: `/pages/profile/index`
- **内容**:
  - 用户信息（头像、昵称）
  - 历史案件（待后端补充接口）
  - 设置（清除缓存、退出登录）

---

## 📦 7. 状态管理建议（Zustand）

```typescript
interface AppStore {
  // ===== 用户 =====
  user: {
    id: string
    openid: string
    nickname?: string
    avatar?: string
  } | null
  token: string | null
  
  // ===== 当前案件 =====
  currentCase: {
    id: string
    title: string
    description?: string
    status: 'active' | 'archived'
    createdAt: string
  } | null
  
  // ===== 对话 =====
  messages: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    images?: string[]
    quickReplies?: Array<{ text: string, value: string }>
    timestamp: string
  }>
  conversationState: 'collecting' | 'confirming' | 'analyzing' | 'ready'
  isAiTyping: boolean
  
  // ===== 材料 =====
  materials: Array<{
    id: string
    type: string
    imageUrl: string
    status: 'pending' | 'processed' | 'failed'
    extractedFields?: Record<string, any>
  }>
  uploadingFiles: Map<string, number>  // fileId -> progress (0-100)
  
  // ===== 报告 =====
  currentReport: {
    id: string
    caseId: string
    analysis: string
    liability: string
    compensation: Record<string, number>
    legalAdvice: string
    suggestions: string
    generatedAt: string
  } | null
  isGeneratingReport: boolean
  
  // ===== Actions =====
  login: (code: string) => Promise<void>
  logout: () => void
  
  createCase: (data: { title: string, description?: string }) => Promise<void>
  updateCase: (updates: Partial<Case>) => Promise<void>
  
  sendMessage: (content: string, images?: string[]) => Promise<void>
  loadMessages: () => Promise<void>
  
  uploadImage: (filePath: string) => Promise<string>  // 返回 OSS URL
  processMaterial: (type: string, imageUrl: string) => Promise<void>
  
  generateReport: () => Promise<void>
  loadReport: (caseId: string) => Promise<void>
}
```

---

## 🔄 8. 完整用户旅程示例

```
1. 【登录】
   小程序启动 → wx.login() → POST /api/auth/login → 存储 token
   
2. 【创建案件】
   首次使用 → POST /api/cases → 创建活跃案件
   
3. 【Agent 引导】
   进入对话页 → AI: "请上传交警认定书"
   
4. 【上传材料】
   点击上传按钮 → wx.chooseImage() → POST /api/upload/image
   → 获得 imageUrl → POST /api/materials/process
   
5. 【字段确认】
   AI 返回识别结果 → 展示字段确认页 → 用户编辑/确认
   → POST /api/conversations/current/messages (content: "确认无误")
   
6. 【重复 3-5】
   AI: "请上传身份证" → 用户上传 → 确认 → ...
   AI: "请上传现场照片" → 用户上传 → 确认 → ...
   
7. 【材料收集完成】
   conversationState 变为 'ready'
   AI: "材料已收集完成，可以生成报告了"
   
8. 【生成报告】
   点击"生成报告" → POST /api/reports/generate
   → 显示加载动画 → 跳转报告页
   
9. 【查看报告】
   GET /api/reports/:caseId → 展示报告内容
   
10. 【导出分享】
   点击导出 → POST /api/reports/:caseId/export
   → 获得下载链接 → 保存到相册或分享
```

---

## 🎨 9. UI/UX 设计要点

### 视觉风格
- **设计系统**: Apple Design System
- **布局**: 卡片式，留白充足
- **配色**: 主色调 + 中性灰 + 功能色（成功绿、警告橙、错误红）
- **圆角**: 大圆角（12px+）
- **阴影**: 轻微卡片阴影，营造层次感

### 交互原则
1. **渐进式引导**: Agent 逐步引导，不一次性要求所有材料
2. **即时反馈**: 
   - 上传显示进度条
   - OCR 识别显示加载动画
   - AI 思考显示打字动画
3. **容错设计**:
   - 识别失败可重试
   - 字段错误可修改
   - 网络超时有提示
4. **快捷操作**: 快捷回复按钮减少输入

### 性能优化
- 图片懒加载（长列表）
- 对话消息虚拟滚动（历史消息很多时）
- 图片上传前压缩（wx.compressImage）
- 并行上传多张图片

### 无障碍
- 重要按钮大尺寸（易点击）
- 清晰的视觉层级
- 加载状态明确告知用户

---

## 🛠️ 10. 后端可配合调整

### 当前缺失但前端可能需要的接口

#### ❌ 历史案件列表
```
GET /api/cases/history
Query: ?page=1&limit=20

// 前端需求：个人中心展示用户的所有历史案件
```

#### ❌ 材料删除
```
DELETE /api/materials/:id

// 前端需求：用户误上传材料时删除
```

#### ❌ 案件归档
```
POST /api/cases/current/archive

// 前端需求：用户完成案件处理后归档，释放"活跃案件"槽位
```

#### ❌ 消息分页
```
GET /api/conversations/current/messages?before=msg_id&limit=50

// 前端需求：对话消息太多时分页加载
```

#### ❌ 报告 PDF 实际生成
```
// 当前是占位实现，需要集成 PDF 生成库（如 puppeteer、pdfkit）
```

### 请求调整流程
如果你在实现 UI 时发现需要：
1. 新的接口端点
2. 现有接口增加字段
3. 响应格式调整
4. 新的业务逻辑

**直接告诉用户**，后端会配合修改！

---

## 📞 11. 开发协作

### 前端职责
1. 实现 UI 界面和交互
2. 对接上述 API 接口
3. 管理 token 和认证状态
4. 图片上传前压缩和预处理
5. 错误处理和用户提示

### 后端职责
1. 提供稳定的 API 接口
2. 业务逻辑处理（AI 分析、OCR 识别）
3. 数据持久化
4. 安全校验（认证、授权）

### 沟通机制
- 接口不明确：查看 `server/src/routes/` 下的路由文件源码
- 需要调整：直接提出需求，后端修改后更新此文档
- Bug 反馈：描述请求参数、预期响应、实际响应

---

## 📚 12. 参考文档

### 后端代码位置
- 路由定义: `server/src/routes/`
- 服务层: `server/src/services/`
- 数据库: `server/src/db/`
- 配置: `server/src/config/`

### 相关文档
- `server/API_SUMMARY.md` - 详细 API 文档
- `server/BACKEND_STATUS.md` - 系统架构和状态
- `server/MIGRATION.md` - 数据库迁移指南

### 外部依赖
- 微信小程序文档: https://developers.weixin.qq.com/miniprogram/dev/
- Taro 文档: https://taro-docs.jd.com/
- DeepSeek API: https://platform.deepseek.com/docs
- 阿里云 OSS: https://help.aliyun.com/product/31815.html
- 阿里云 OCR: https://help.aliyun.com/product/442180.html

---

## ✅ 13. 检查清单

在开始前端开发前，请确认：

- [ ] 已阅读本文档
- [ ] 理解对话状态机流程
- [ ] 理解材料识别 + 字段确认交互
- [ ] 知道如何处理 JWT 认证
- [ ] 知道图片上传 → 材料处理的完整流程
- [ ] 知道快捷回复的渲染方式
- [ ] 对不明确的接口字段已标记待询问

---

**祝开发顺利！有任何问题随时反馈给用户，后端随时配合调整。** 🚀
