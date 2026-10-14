import { safeError } from './utils/safe-error'
import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import multer from 'multer'
import { db } from './db'
import { authMiddleware } from './middleware/auth'
import authRouter from './routes/auth'
import casesRouter from './routes/cases'
import conversationsRouter from './routes/conversations'
import uploadRoutes from './routes/upload'
import reportRoutes from './routes/reports'
import { materialsRouter } from './routes/materials'
import paymentOrderRoutes, { casePaymentRouter, paymentNotificationHandler, testPaymentRouter } from './routes/payments'
import { config, validateRuntimeConfig } from './config'
import { createRateLimiter, requestContext, securityHeaders } from './middleware/security'

// 环境变量由入口导入 dotenv/config

const app = express()
app.disable('x-powered-by')
const PORT = config.port

app.set('trust proxy', 1)
app.use(requestContext)
app.use(securityHeaders)

// 中间件
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) return callback(null, true)
    callback(new Error('CORS_ORIGIN_NOT_ALLOWED'))
  },
  credentials: true,
}))

// Public, signature-verified payment callback must receive the untouched body.
app.post('/api/payments/wechat/notify', express.raw({ type: 'application/json' }), paymentNotificationHandler)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

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

// 路由
app.get('/api/health', async (req, res) => {
  const databaseOk = await db.ping()
  res.status(databaseOk ? 200 : 503).json({
    status: databaseOk ? 'ok' : 'error',
    database: databaseOk ? 'ok' : 'unavailable',
    timestamp: new Date().toISOString(),
  })
})

// 公开路由
app.use('/api/auth', createRateLimiter({ windowMs: 60_000, max: 20 }), authRouter)

// 需要认证的路由
app.use('/api/cases', authMiddleware, casePaymentRouter)
app.use('/api/cases', authMiddleware, casesRouter)
app.use('/api/payment-orders', authMiddleware, createRateLimiter({ windowMs: 60_000, max: 30 }), paymentOrderRoutes)
if (process.env.NODE_ENV === 'test') {
  app.use('/api/test/payments', authMiddleware, testPaymentRouter)
}
app.use('/api/conversations', authMiddleware, conversationsRouter)
app.use('/api/reports', authMiddleware, createRateLimiter({ windowMs: 60_000, max: 10 }), reportRoutes)
app.use('/api/materials', authMiddleware, createRateLimiter({ windowMs: 60_000, max: 20 }), materialsRouter)
app.use('/api/upload', authMiddleware, createRateLimiter({ windowMs: 60_000, max: 30 }), uploadRoutes)

// 错误处理
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? '文件大小超过限制' : '上传参数无效'
    return res.status(400).json({ error: 'InvalidUpload', message })
  }
  if (err.message === 'CORS_ORIGIN_NOT_ALLOWED') {
    return res.status(403).json({ error: 'ForbiddenOrigin', message: '请求来源不允许' })
  }
  console.error('服务器错误:', safeError(err))
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
  validateRuntimeConfig()
  const databaseOk = await db.ping()
  if (!databaseOk) {
    throw new Error('数据库连接失败')
  }

  console.log('✅ 数据库连接成功')
  app.listen(PORT, config.host, () => {
    console.log(`✅ 灵迈后端服务启动成功`)
    console.log(`📡 监听地址: ${config.host}:${PORT}`)
    console.log(`🌍 环境: ${process.env.NODE_ENV}`)
    console.log(`💾 数据库: ${process.env.DB_TYPE || 'memory'}`)
    console.log(`🪣 OSS Bucket: ${process.env.ALIYUN_OSS_BUCKET || '未配置'}`)
  })
}

start().catch((err) => {
  console.error('启动失败:', safeError(err))
  process.exit(1)
})
