export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/linkmai',
  jwtSecret: process.env.JWT_SECRET || 'linkmai-secret-key-change-in-production',
  oss: {
    region: process.env.ALIYUN_OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || '',
    bucket: process.env.ALIYUN_OSS_BUCKET || 'linkmai-accident-files',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1',
  },
}
