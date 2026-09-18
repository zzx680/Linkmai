#!/usr/bin/env tsx
/**
 * 初始化数据库脚本
 * 使用方法：npm run db:init
 */

import { pool } from '../db/postgres'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function initDatabase() {
  console.log('🚀 开始初始化数据库...')

  try {
    // 测试连接
    console.log('📡 测试数据库连接...')
    const pingResult = await pool.query('SELECT NOW()')
    console.log('✅ 数据库连接成功:', pingResult.rows[0].now)

    // 读取 SQL 文件
    const schemaPath = join(__dirname, '../db/schema.sql')
    const schemaSql = readFileSync(schemaPath, 'utf-8')

    // 执行建表语句
    console.log('📋 执行建表语句...')
    await pool.query(schemaSql)
    console.log('✅ 表结构创建成功')

    // 验证表是否存在
    console.log('🔍 验证表结构...')
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)

    console.log('📊 已创建的表:')
    tablesResult.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`)
    })

    console.log('\n✨ 数据库初始化完成！')
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

initDatabase()
