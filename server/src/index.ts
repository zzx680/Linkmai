import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { testConnection } from './db'
import { authMiddleware } from './middleware/auth'
import authRouter from './routes/auth'
import casesRouter from './routes/cases'
import conversationsRouter from './routes/conversations'
import uploadRoutes from './routes/upload'
import reportRoutes from './routes/reports'
import { getPresignUrl, confirmUpload } from './controllers/file.controller'
import agentRoutes from './routes/agent'

// 加载环境变量
dotenv.config()

const app = express()
const PORT = process.env.PORT || 8000

// 中间件
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://servicewechat.com',
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 临时认证中间件（MVP 占位）
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        openid: string
      }
      userId?: string
    }
  }
}

function mockAuth(req: Request, res: Response, next: NextFunction) {
  // TODO: 实现真实的微信登录认证
  req.user = {
    id: 'mock-user-id',
    openid: 'mock-openid',
  }
  req.userId = 'mock-user-id'
  next()
}

// 路由
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

// 公开路由
app.use('/api/auth', authRouter)

// 需要认证的路由
app.use('/api/cases', authMiddleware, casesRouter)
app.use('/api/conversations', authMiddleware, conversationsRouter)
app.use('/api/reports', authMiddleware, reportRoutes)

// 旧路由保留（兼容）
app.post('/api/files/presign', mockAuth, getPresignUrl)
app.post('/api/files/confirm', mockAuth, confirmUpload)
app.use('/api/upload', mockAuth, uploadRoutes)
app.use('/api/agent', mockAuth, agentRoutes)

// 错误处理
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('服务器错误:', err)
  res.status(500).json({
    error: 'InternalError',
    message: '服务器内部错误',
  })
})

// 404
app.use((req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: '接口不存在',
  })
})

// 启动服务
async function start() {
  // 测试数据库连接
  await testConnection()

  app.listen(PORT, () => {
    console.log(`✅ 灵迈后端服务启动成功`)
    console.log(`📡 监听端口: ${PORT}`)
    console.log(`🌍 环境: ${process.env.NODE_ENV}`)
    console.log(`🪣 OSS Bucket: ${process.env.ALIYUN_OSS_BUCKET || '未配置'}`)
  })
}

start().catch((err) => {
  console.error('启动失败:', err)
  process.exit(1)
})
