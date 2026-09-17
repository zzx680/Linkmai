# 灵迈 - 一站式交通事故处理服务

## 项目结构

```
灵迈/
├── miniprogram/          # 微信小程序前端（Taro）
│   ├── src/
│   │   ├── pages/       # 四个主页面
│   │   │   ├── agent/   # AI Agent 对话
│   │   │   ├── case/    # 历史案例
│   │   │   ├── consultation/ # 律师咨询
│   │   │   └── profile/ # 个人中心
│   │   ├── store/       # Zustand 状态管理
│   │   ├── utils/       # 工具函数
│   │   └── styles/      # 全局样式
│   └── dist/            # 编译输出
│
└── server/              # Node.js 后端（Express）
    ├── src/
    │   ├── controllers/ # 业务控制器
    │   ├── routes/      # 路由定义
    │   ├── services/    # 核心服务
    │   │   ├── deepseek.ts  # DeepSeek AI 集成
    │   │   ├── oss.ts       # 阿里云 OSS
    │   │   └── ocr.ts       # OCR 识别
    │   └── index.ts     # 服务入口
    └── dist/            # 编译输出
```

## 技术栈

### 前端
- **框架**: Taro 4 + React 18
- **状态管理**: Zustand
- **样式**: SCSS + Apple Design System
- **平台**: 微信小程序

### 后端
- **框架**: Express + TypeScript
- **AI**: DeepSeek Vision API
- **存储**: 阿里云 OSS
- **OCR**: 阿里云通用文字识别

## 快速开始

### 1. 安装依赖

```bash
# 前端
cd miniprogram
npm install

# 后端
cd server
npm install
```

### 2. 配置环境变量

```bash
cd server
cp .env.example .env
# 编辑 .env 填入你的配置
```

需要配置：
- 阿里云 OSS（Region, Bucket, AccessKey）
- DeepSeek API Key

### 3. 启动开发

```bash
# 启动后端
cd server
npm run dev

# 编译小程序
cd miniprogram
npm run dev:weapp
```

### 4. 微信开发者工具

1. 打开微信开发者工具
2. 导入项目：选择 `miniprogram` 目录
3. AppID: `wx38fafb051a96a529`
4. 预览小程序

## API 文档

### Agent 对话

#### 创建会话
```
POST /api/agent/conversation
Response: { conversationId: string }
```

#### 发送消息
```
POST /api/agent/message
Body: {
  conversationId: string
  content: string
  images?: string[]
}
Response: {
  message: string
  nextAction?: 'collect_media' | 'analyze' | 'generate'
}
```

### 文件上传

#### 获取上传凭证
```
POST /api/files/presign
Body: { fileType: 'image' | 'video' | 'document' }
Response: {
  region: string
  bucket: string
  objectKey: string
  accessKeyId: string
  accessKeySecret: string
}
```

## 工作流程

1. **初始化** - 用户进入 Agent 页面
2. **收集信息** - 引导用户上传材料或描述事故
3. **图片分析** - DeepSeek Vision 分析现场照片
4. **责任判定** - AI 基于交通规则和案例分析责任
5. **赔偿计算** - 计算各项赔偿金额
6. **生成报告** - 生成 PDF 定责和赔偿报告

## 成本估算

基于 DeepSeek Flash 模型：
- 每个案例约 3-5 张图片
- 成本约 ¥0.013/案例
- 比 Claude Vision 便宜 50 倍

## 部署

### 后端部署

```bash
npm run build
npm start
```

### 小程序发布

1. 编译生产版本：`npm run build:weapp`
2. 微信开发者工具上传代码
3. 微信公众平台提交审核

## 开发状态

- ✅ 前端四页面 + Apple 风格 UI
- ✅ 文件上传工具函数
- ✅ Agent 状态机
- ✅ DeepSeek Vision 集成
- ✅ OSS 文件管理
- ✅ OCR 文字识别
- 🚧 真实 AI 分析逻辑
- 🚧 PDF 报告生成
- 🚧 微信登录认证

## 许可证

MIT
