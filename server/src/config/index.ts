import 'dotenv/config'
import { readFileSync } from 'fs'

function secret(name: string) {
  const file = process.env[`${name}_FILE`]
  if (file) return readFileSync(file, 'utf8').trim()
  return process.env[name] || ''
}

const defaultJwtSecret = 'linkmai-secret-key-change-in-production'
const nodeEnv = process.env.NODE_ENV || 'development'
const strictEnvironment = ['staging', 'production'].includes(nodeEnv)
const localDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1'])
const corsOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'https://servicewechat.com')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || (strictEnvironment ? '127.0.0.1' : '0.0.0.0'),
  nodeEnv,
  strictEnvironment,
  corsOrigins,
  database: {
    type: process.env.DB_TYPE || 'memory',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    name: process.env.POSTGRES_DB || 'linkmai',
    ssl: process.env.POSTGRES_SSL === 'true',
    sslCa: secret('POSTGRES_SSL_CA').replace(/\\n/g, '\n'),
  },
  jwtSecret: process.env.JWT_SECRET || defaultJwtSecret,
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
    allowMockLogin: process.env.ALLOW_MOCK_WECHAT_LOGIN === 'true',
  },
  oss: {
    region: process.env.ALIYUN_OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || '',
    bucket: process.env.ALIYUN_OSS_BUCKET || 'linkmai-accident-files',
  },
  ocr: {
    accessKeyId: process.env.ALIYUN_OCR_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIYUN_OCR_ACCESS_KEY_SECRET || '',
    endpoint: process.env.ALIYUN_OCR_ENDPOINT || 'ocr.cn-shanghai.aliyuncs.com',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiUrl: (process.env.DEEPSEEK_API_URL || process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    timeoutMs: parseInt(process.env.DEEPSEEK_TIMEOUT_MS || '30000', 10),
  },
  payment: {
    amountCents: parseInt(process.env.PAYMENT_AMOUNT_CENTS || '4990', 10),
    currency: process.env.PAYMENT_CURRENCY || 'CNY',
    orderExpiresMinutes: parseInt(process.env.PAYMENT_ORDER_EXPIRES_MINUTES || '15', 10),
    provider: process.env.PAYMENT_PROVIDER || 'mock',
    testSecret: process.env.PAYMENT_TEST_SECRET || '',
    wechat: {
      appId: process.env.WECHAT_APP_ID || '',
      mchId: process.env.WECHAT_MCH_ID || '',
      serialNo: process.env.WECHAT_MCH_SERIAL_NO || '',
      privateKey: secret('WECHAT_MCH_PRIVATE_KEY'),
      apiV3Key: secret('WECHAT_API_V3_KEY'),
      platformPublicKey: secret('WECHAT_PLATFORM_PUBLIC_KEY'),
      platformSerialNo: process.env.WECHAT_PLATFORM_SERIAL_NO || '',
      notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || '',
    },
  },
}

export function validateRuntimeConfig() {
  if (!config.strictEnvironment) return

  const localDatabase = localDatabaseHosts.has(config.database.host)
  const required = [
    ['NODE_ENV=staging|production', ['staging', 'production'].includes(config.nodeEnv)],
    ['DB_TYPE=postgres', config.database.type === 'postgres'],
    ['POSTGRES_HOST', Boolean(process.env.POSTGRES_HOST)],
    ['POSTGRES_PORT', Boolean(process.env.POSTGRES_PORT)],
    ['POSTGRES_USER', Boolean(process.env.POSTGRES_USER)],
    ['POSTGRES_PASSWORD', Boolean(process.env.POSTGRES_PASSWORD)],
    ['POSTGRES_DB', Boolean(process.env.POSTGRES_DB)],
    ['POSTGRES_SSL=true for remote database', localDatabase || config.database.ssl],
    ['POSTGRES_SSL_CA for remote database', localDatabase || Boolean(config.database.sslCa)],
    ['JWT_SECRET', Boolean(config.jwtSecret && config.jwtSecret !== defaultJwtSecret && config.jwtSecret.length >= 32)],
    ['ALLOW_MOCK_WECHAT_LOGIN=false', !config.wechat.allowMockLogin],
    ['WECHAT_APP_ID', Boolean(config.wechat.appId)],
    ['WECHAT_APP_SECRET', Boolean(config.wechat.appSecret)],
    ['ALIYUN_OSS_REGION', Boolean(config.oss.region)],
    ['ALIYUN_OSS_ACCESS_KEY_ID', Boolean(config.oss.accessKeyId)],
    ['ALIYUN_OSS_ACCESS_KEY_SECRET', Boolean(config.oss.accessKeySecret)],
    ['ALIYUN_OSS_BUCKET', Boolean(config.oss.bucket)],
    ['ALIYUN_OCR_ACCESS_KEY_ID', Boolean(config.ocr.accessKeyId)],
    ['ALIYUN_OCR_ACCESS_KEY_SECRET', Boolean(config.ocr.accessKeySecret)],
    ['DEEPSEEK_API_KEY', Boolean(config.deepseek.apiKey)],
    ['PAYMENT_PROVIDER=wechat in production', config.nodeEnv !== 'production' || config.payment.provider === 'wechat'],
    ['PAYMENT_PROVIDER=wechat|disabled in staging', config.nodeEnv !== 'staging' || ['wechat', 'disabled'].includes(config.payment.provider)],
    ['WECHAT_MCH_ID', config.payment.provider !== 'wechat' || Boolean(config.payment.wechat.mchId)],
    ['WECHAT_MCH_SERIAL_NO', config.payment.provider !== 'wechat' || Boolean(config.payment.wechat.serialNo)],
    ['WECHAT_MCH_PRIVATE_KEY', config.payment.provider !== 'wechat' || Boolean(config.payment.wechat.privateKey)],
    ['WECHAT_API_V3_KEY', config.payment.provider !== 'wechat' || Boolean(config.payment.wechat.apiV3Key)],
    ['WECHAT_PLATFORM_PUBLIC_KEY', config.payment.provider !== 'wechat' || Boolean(config.payment.wechat.platformPublicKey)],
    ['WECHAT_PLATFORM_SERIAL_NO', config.payment.provider !== 'wechat' || Boolean(config.payment.wechat.platformSerialNo)],
    ['WECHAT_PAY_NOTIFY_URL', config.payment.provider !== 'wechat' || Boolean(config.payment.wechat.notifyUrl && config.payment.wechat.notifyUrl.startsWith('https://'))],
  ] as const

  const missing = required.filter(([, valid]) => !valid).map(([name]) => name)
  if (missing.length > 0) {
    throw new Error(`${config.nodeEnv} 配置不完整: ${missing.join(', ')}`)
  }
}