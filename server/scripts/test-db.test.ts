import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const script = path.resolve(__dirname, 'test-db.js')

test('test-db executes as CommonJS from repository root without connecting in memory mode', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DB_TYPE: 'memory' },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /使用内存数据库/)
})

test('test-db rejects unsupported database configuration instead of connecting', () => {
  const result = spawnSync(process.execPath, [script], { env: { ...process.env, DB_TYPE: 'unsupported' }, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /不支持的数据库类型/)
})
