#!/usr/bin/env node

/**
 * 数据库连接测试脚本
 * 用法: node scripts/test-db.js
 */

const dotenv = require('dotenv')
const { Pool } = require('pg')
const path = require('node:path')

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const dbType = process.env.DB_TYPE || 'memory'

console.log('=== 数据库连接测试 ===')
console.log(`数据库类型: ${dbType}\n`)

if (dbType === 'memory') {
  console.log('✓ 使用内存数据库（无需测试连接）')
  process.exit(0)
}

if (dbType !== 'postgres') {
  console.error(`不支持的数据库类型: ${dbType}`)
  process.exit(1)
}

const { readFileSync } = require('node:fs')
const sslCa = process.env.POSTGRES_SSL_CA_FILE
  ? readFileSync(process.env.POSTGRES_SSL_CA_FILE, 'utf8').trim()
  : (process.env.POSTGRES_SSL_CA || '').replace(/\\n/g, '\n')

// 测试 PostgreSQL 连接，与服务端保持一致的 TLS 校验。
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'linkmai',
  connectionTimeoutMillis: 5000,
  ssl: process.env.POSTGRES_SSL === 'true'
    ? { rejectUnauthorized: true, ...(sslCa ? { ca: sslCa } : {}) }
    : false,
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
      'case_entitlements',
      'cases',
      'consultations',
      'conversations',
      'extracted_fields',
      'messages',
      'payment_orders',
      'reports',
      'schema_migrations',
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
      console.log('发现缺失的表，请从 server 目录运行初始化命令:')
      console.log('   npm run db:migrate:dev')
    } else {
      console.log()
      console.log('✓ 所有表结构正常')
    }

    process.exitCode = missingTables.length > 0 ? 1 : 0
  } catch (err) {
    console.error()
    console.error('✗ 连接失败:', err.message)
    console.error()
    console.error('请检查:')
    console.error('  1. PostgreSQL 是否运行')
    console.error('  2. .env 配置是否正确')
    console.error('  3. 数据库是否已创建')
    console.error()
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

test().catch(err => {
  console.error('数据库测试失败:', err.message)
  process.exitCode = 1
})
