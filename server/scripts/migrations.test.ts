import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { loadMigrations } from '../src/scripts/migrate'

const requiredTables = [
  'users',
  'cases',
  'conversations',
  'messages',
  'artifacts',
  'reports',
  'case_entitlements',
  'payment_orders',
  'feedback',
  'privacy_requests',
  'audit_logs',
  'run_events',
  'legal_documents',
  'legal_sections',
]

test('database migrations are ordered and contain staging tables', async () => {
  const migrations = await loadMigrations(path.resolve(process.cwd(), 'migrations'))
  assert.ok(migrations.length > 0)
  assert.deepEqual(
    migrations.map(migration => migration.version),
    [...migrations.map(migration => migration.version)].sort()
  )
  assert.equal(new Set(migrations.map(migration => migration.version)).size, migrations.length)

  const schema = migrations.map(migration => migration.sql).join('\n')
  for (const table of requiredTables) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))
  }
  assert.match(schema, /legal_documents_effective_interval/)
  assert.match(schema, /legal_ref_id VARCHAR\(160\) NOT NULL UNIQUE/)
  assert.match(schema, /idx_legal_sections_search/)
  assert.match(schema, /search_vector TSVECTOR NOT NULL/)
})
