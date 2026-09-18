#!/usr/bin/env node

/**
 * 数据库连接测试脚本
 * 用法: node scripts/test-db.js
 */

import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()
const { Pool } = pg

const dbType = process.env.DB_TYPE || 'memory'

console.log('=== 数据库连接测试 ===')
console.log(`数据库类型: ${dbType}\n`)

if (dbType === 'memory') {
  console.log('✓ 使用内存数据库（无需测试连接）')
  process.exit(0)
}

// 测试 PostgreSQL 连接
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

async function test() {
  try {
    console.log('连接配置:')
    console.log(`  Host: ${process.env.POSTGRES_HOST}`)
    console.log(`  Port: ${process.env.POSTGRES_PORT || 5432}`)
    console.log(`  Database: ${process.env.POSTGRES_DB}`)
    console.log(`  User: ${process.env.POSTGRES_USER}`)
    console.log()

    // 测试连接
    console.log('测试连接...')
    const result = await pool.query('SELECT NOW() as now, version() as version')
    console.log('✓ 连接成功')
    console.log(`  时间: ${result.rows[0].now}`)
    console.log(`  版本: ${result.rows[0].version.split('\n')[0]}`)
    console.log()

    // 检查表
    console.log('检查表结构...')
    const tables = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `)

    const expectedTables = [
      'artifacts',
      'cases',
      'consultations',
      'conversations',
      'extracted_fields',
      'messages',
      'reports',
      'users',
    ]

    const existingTables = tables.rows.map(r => r.tablename)

    for (const table of expectedTables) {
      if (existingTables.includes(table)) {
        console.log(`  ✓ ${table}`)
      } else {
        console.log(`  ✗ ${table} (缺失)`)
      }
    }

    const missingTables = expectedTables.filter(t => !existingTables.includes(t))

    if (missingTables.length > 0) {
      console.log()
      console.log('⚠️  发现缺失的表，请运行初始化脚本:')
      console.log('   ./scripts/setup-db.sh')
    } else {
      console.log()
      console.log('✓ 所有表结构正常')
    }

    await pool.end()
    process.exit(missingTables.length > 0 ? 1 : 0)
  } catch (err) {
    console.error()
    console.error('✗ 连接失败:', err.message)
    console.error()
    console.error('请检查:')
    console.error('  1. PostgreSQL 是否运行')
    console.error('  2. .env 配置是否正确')
    console.error('  3. 数据库是否已创建')
    console.error()
    process.exit(1)
  }
}

test()
