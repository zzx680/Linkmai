# 灵迈后端 API 文档

## 服务状态
✅ 服务运行中：http://localhost:8000

## 已实现的 P0 核心功能

### 1. 认证相关 `/api/auth`
- `POST /api/auth/login` - 微信登录（使用 code 换取 session）

### 2. 案件管理 `/api/cases`
- `GET /api/cases/current` - 获取当前活跃案件
- `POST /api/cases` - 创建新案件
- `PUT /api/cases/current` - 更新当前案件

### 3. 对话管理 `/api/conversations`
- `GET /api/conversations/current` - 获取当前对话
- `GET /api/conversations/current/messages` - 获取对话消息列表
- `POST /api/conversations/current/messages` - 发送消息（带 Agent 材料识别）

**核心功能**：上传图片材料后，自动调用：
- 阿里云 OCR 识别文字
- DeepSeek AI 提取结构化字段
- 返回确认消息和快捷回复按钮

### 4. 文件上传 `/api/upload`
- `POST /api/upload/image` - 上传图片到 OSS
- `POST /api/upload/video` - 上传视频到 OSS

### 5. 报告生成 `/api/reports`
- `POST /api/reports/generate` - 生成事故分析报告
- `GET /api/reports/current/text` - 获取报告文本

**报告内容包括**：
- 事故经过分析
- 责任认定
- 赔偿建议
- 处理建议

## 已集成的服务

### 阿里云 OSS
- Bucket: `linkmai-accident-files`
- Region: `cn-hangzhou`
- 自动生成唯一文件名
- 支持图片和视频上传

### 阿里云 OCR
- 通用文字识别
- 交警认定书识别
- 身份证识别
- 营业执照识别

### DeepSeek AI
- 文本对话（deepseek-chat）
- 图片分析（Vision API）
- 结构化信息提取
- 报告生成

## 数据存储
当前使用内存存储（MemoryDB），数据保存在内存中：
- 用户会话
- 对话历史
- 案件信息
- 消息记录

## 环境变量配置
需要在 `.env` 中配置：
```
# 服务端口
PORT=8000

# 阿里云 OSS
ALIYUN_OSS_REGION=cn-hangzhou
ALIYUN_OSS_BUCKET=linkmai-accident-files
ALIYUN_OSS_ACCESS_KEY_ID=your_key
ALIYUN_OSS_ACCESS_KEY_SECRET=your_secret

# DeepSeek API
DEEPSEEK_API_KEY=your_key

# JWT 密钥
JWT_SECRET=your_secret

# 微信小程序
WECHAT_APPID=your_appid
WECHAT_SECRET=your_secret
```

## 核心业务流程

### 材料识别流程
1. 用户上传图片（`POST /api/upload/image`）
2. 图片保存到 OSS，返回 URL
3. 前端发送消息（`POST /api/conversations/current/messages`）带图片 URL
4. 后端调用 OCR 识别文字
5. 后端调用 DeepSeek 提取结构化字段
6. 返回识别结果和确认消息
7. 用户确认后继续对话

### 报告生成流程
1. Agent 收集完所有必要信息
2. 调用 `POST /api/reports/generate`
3. DeepSeek 基于事实生成报告
4. 返回完整报告（分析、责任、赔偿、建议）
5. 案件状态更新为 "已完成"

## 下一步
- [ ] 集成真实 PostgreSQL 数据库
- [ ] 完善 Agent 对话状态机
- [ ] 优化材料识别准确率
- [ ] 添加更多材料类型支持
- [ ] 实现报告导出功能
