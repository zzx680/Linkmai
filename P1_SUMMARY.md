# 灵迈事故理赔助手 - P1 完成总结

## 项目概述

灵迈是一个基于微信小程序的交通事故理赔智能助手，通过 AI 对话和材料识别，帮助用户快速完成事故信息收集、责任分析和理赔指导。

## P1 核心功能已完成 ✅

### 1. 智能对话引擎
- **多轮对话管理**：问题树 + 状态机（collecting → confirming → analyzing → completed）
- **上下文理解**：DeepSeek AI 集成，支持自然语言问答
- **快速回复**：引导式选项，提升交互效率
- **材料触发**：上传图片自动触发识别和字段提取

### 2. 材料识别系统
- **OCR 集成**：阿里云通用识别 + 交警认定书专项识别
- **AI 视觉理解**：DeepSeek Vision 分析事故现场照片
- **字段提取**：自动识别关键信息（时间、地点、车辆、人员）
- **确认流程**：用户可查看和修改识别结果

### 3. 文件管理
- **OSS 存储**：阿里云对象存储，已测试上传成功
- **批量上传**：支持多张图片同时上传
- **预签名 URL**：临时访问链接，安全可控

### 4. 报告生成
- **事故分析**：基于收集的事实生成结构化报告
- **责任认定**：AI 辅助判断责任比例
- **赔偿估算**：初步计算赔偿金额
- **法律建议**：提供后续处理建议

### 5. 认证与权限
- **微信登录**：Code 换 OpenID，JWT Token 认证
- **会话管理**：Token 自动刷新，过期检测
- **用户隔离**：多租户数据隔离

## 技术架构

### 后端（Node.js + Express）
```
server/
├── src/
│   ├── routes/          # API 路由
│   │   ├── auth.ts      # 微信登录
│   │   ├── cases.ts     # 案件管理
│   │   ├── conversations.ts  # 对话管理
│   │   ├── materials.ts # 材料处理
│   │   └── reports.ts   # 报告生成
│   ├── services/        # 业务逻辑
│   │   ├── agent.ts     # Agent 状态机
│   │   ├── deepseek.ts  # AI 集成
│   │   ├── ocr.ts       # OCR 集成
│   │   ├── material.ts  # 材料识别
│   │   └── report.ts    # 报告生成
│   ├── middleware/      # 中间件
│   │   ├── auth.ts      # JWT 认证
│   │   └── error.ts     # 错误处理
│   └── db/              # 数据层
│       └── memory.ts    # 内存数据库（MVP）
```

### 前端（Taro + React）
```
src/
├── pages/
│   ├── agent/           # 主对话界面
│   ├── cases/           # 案件列表
│   └── report/          # 报告查看
├── components/
│   ├── agent/           # 对话组件
│   │   ├── MessageList.tsx
│   │   ├── Composer.tsx
│   │   └── ArtifactCard.tsx
│   └── shared/          # 通用组件
├── services/
│   ├── upload.ts        # 文件上传
│   └── api.ts           # API 封装
└── types/
    └── domain.ts        # 类型定义
```

## API 端点总览

### 认证
- `POST /api/auth/wechat/login` - 微信登录

### 案件
- `GET /api/cases` - 获取案件列表
- `POST /api/cases/current` - 创建/获取当前案件

### 对话
- `POST /api/conversations/current` - 获取或创建对话
- `POST /api/conversations/current/messages` - 发送消息
- `GET /api/conversations/current/messages` - 获取消息历史

### 材料
- `POST /api/materials/process` - 处理单个材料
- `POST /api/materials/batch-process` - 批量处理

### 文件
- `POST /api/upload/image` - 上传图片到 OSS
- `POST /api/upload/video` - 上传视频到 OSS

### 报告
- `POST /api/reports/generate` - 生成报告
- `GET /api/reports/:caseId` - 查询报告
- `POST /api/reports/:caseId/export` - 导出报告

## 环境配置

### 后端 `.env`
```bash
# DeepSeek AI
DEEPSEEK_API_KEY=sk-xxx

# 阿里云 OSS
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET=linkmai-accident-files
OSS_REGION=oss-cn-hangzhou

# 阿里云 OCR
ALIYUN_ACCESS_KEY_ID=xxx
ALIYUN_ACCESS_KEY_SECRET=xxx

# 微信小程序
WECHAT_APPID=xxx
WECHAT_SECRET=xxx

# JWT
JWT_SECRET=xxx

# 服务器
PORT=8000
```

### 前端 `.env.development`
```bash
TARO_APP_API_URL=http://localhost:8000
```

## 已测试功能

✅ 微信登录流程  
✅ OSS 图片上传（已验证真实上传）  
✅ OCR 文字识别  
✅ DeepSeek AI 对话  
✅ DeepSeek Vision 图片分析  
✅ 材料识别和字段提取  
✅ 报告生成  
✅ 前端编译和打包  

## 部署状态

- **后端服务**：运行中（端口 8000）
- **前端小程序**：编译成功，可在微信开发者工具中调试
- **OSS Bucket**：`linkmai-accident-files` 已创建（杭州区域）

## 启动命令

### 后端
```bash
cd server
npm run dev      # 开发环境
npm start        # 生产环境
npm run build    # 编译 TypeScript
```

### 前端
```bash
cd /Users/charlie/灵迈
npm run dev:weapp      # 开发模式
npm run build:weapp    # 生产构建
```

## 待实现功能（P2）

### 1. 数据持久化
- [ ] PostgreSQL/MySQL 集成
- [ ] 数据迁移脚本
- [ ] 备份策略

### 2. 律师服务对接
- [ ] 咨询转介 API
- [ ] 订单管理
- [ ] 材料打包下载

### 3. 语音功能
- [ ] 阿里云/腾讯云 ASR 集成
- [ ] 语音转文字
- [ ] 实时语音识别

### 4. 报告导出
- [ ] PDF 生成
- [ ] Word 导出
- [ ] 邮件发送

### 5. 监控与日志
- [ ] Sentry 错误追踪
- [ ] 识别成功率统计
- [ ] 用户行为分析
- [ ] 性能监控

### 6. 小程序优化
- [ ] 页面加载优化
- [ ] 图片懒加载
- [ ] 离线缓存
- [ ] 骨架屏

### 7. 合规与安全
- [ ] 隐私协议
- [ ] 用户协议
- [ ] 数据加密
- [ ] 敏感信息脱敏
- [ ] 微信小程序审核准备

## 下一步建议

1. **真机测试**：在微信开发者工具中完整测试核心流程
2. **用户测试**：邀请 3-5 个真实用户试用，收集反馈
3. **性能优化**：测试并发场景，优化响应时间
4. **数据库迁移**：从内存数据库迁移到 PostgreSQL
5. **监控部署**：集成 Sentry + 日志系统
6. **小程序提审**：准备资质材料，提交微信审核

---

**项目状态**：P1 核心功能完成，可进入测试和优化阶段。
**代码质量**：TypeScript 类型完整，编译无错误，已通过构建测试。
**服务状态**：后端运行正常，API 健康检查通过。
