import { Pool } from 'pg'
import { config } from '../config'

export const pool = new Pool({
  connectionString: config.databaseUrl,
})

export async function testConnection() {
  try {
    const client = await pool.connect()
    await client.query('SELECT NOW()')
    client.release()
    console.log('✅ 数据库连接成功')
  } catch (err: any) {
    console.warn('⚠️  数据库连接失败，使用内存存储:', err.message)
  }
}
