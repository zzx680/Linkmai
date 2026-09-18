import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    type: process.env.DB_TYPE || 'memory',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    name: process.env.POSTGRES_DB || 'linkmai',
    ssl: process.env.POSTGRES_SSL === 'true',
  },
  jwtSecret: process.env.JWT_SECRET || 'linkmai-secret-key-change-in-production',
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
    apiUrl: process.env.DEEPSEEK_API_URL || process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1',
  },
}
