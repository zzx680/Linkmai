#!/usr/bin/env tsx

import { safeError } from '../utils/safe-error'
import { pool } from '../db/postgres'
import { runMigrations } from './migrate'

async function initDatabase() {
  try {
    await runMigrations()
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    console.log(`数据库已就绪，共 ${result.rowCount || 0} 张业务表`)
  } finally {
    await pool.end()
  }
}

initDatabase().catch(error => {
  console.error('数据库初始化失败:', safeError(error))
  process.exit(1)
})
