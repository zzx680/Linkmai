import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { Pool } from 'pg'
import { db as postgresDB } from '../src/db/postgres'
import { memoryDB } from '../src/db/memory'
import { materialSnapshot } from '../src/services/material-snapshot'
let generate: (facts: unknown[], caseId: string) => Promise<unknown> = async (_facts, caseId) => ({ ...content, caseId })
for (const [path, exports] of [
  ['../src/services/report', { generateReport: (facts: unknown[], caseId: string) => generate(facts, caseId) }],
  ['../src/services/payment', { requirePaidEntitlement: async () => undefined }],
] as const) {
  const id = require.resolve(path)
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule
}
const reportsRouter = require('../src/routes/reports').default

async function fixture() {
  const user = await memoryDB.createUser(`report-${Math.random()}`)
  const first = await memoryDB.createCase(user.id, { title: 'A' })
  const artifact = await memoryDB.createArtifact({ caseId: first.id, name: 'medical', type: 'medical_record', ossUrl: 'https://owned.invalid/image', ossKey: 'owned', fileSize: 1, mimeType: 'image/png', status: 'processed', metadata: { fields: [] } })
  await memoryDB.confirmArtifact(user.id, first.id, artifact.id, [{ key: 'injury', label: '伤情', value: '骨折' }])
  const second = await memoryDB.createCase(user.id, { title: 'B' })
  return { user, first, second, artifact }
}

const content = { caseId: 'unused', liability: '结论', compensation: '金额', analysis: '分析', recommendations: ['建议'], summary: '摘要', generatedAt: new Date().toISOString() }

async function route(method: string, path: string, request: object) {
  const layer = (reportsRouter as any).stack.find((item: any) => item.route?.path === path && item.route.methods[method])
  let status = 200
  let payload: any
  const res = { status(code: number) { status = code; return this }, json(body: unknown) { payload = body; return this } }
  await layer.route.stack[0].handle(request, res)
  return { status, payload }
}

test('PostgreSQL updateCase binds explicit case ID before owner and handles no match', async () => {
  const query = mock.method(Pool.prototype, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /id = \$3 AND user_id = \$4/)
    assert.deepEqual(values, [true, 'ready', 'case-A', 'owner'])
    return { rows: [] }
  })
  try { assert.equal(await postgresDB.updateCase('owner', { hasReport: true, status: 'ready' }, 'case-A'), null) }
  finally { query.mock.restore() }
})

test('snapshot publication updates only owned target and rejects a material update during generation', async () => {
  const { user, first, second, artifact } = await fixture()
  const snapshot = materialSnapshot(await memoryDB.getArtifactsByCase(first.id))
  await memoryDB.publishReport(user.id, first.id, content, snapshot)
  assert.equal((await memoryDB.findCaseById(user.id, first.id))?.hasReport, true)
  assert.equal((await memoryDB.findCaseById(user.id, first.id))?.liability, content.liability)
  assert.equal((await memoryDB.findCaseById(user.id, second.id))?.hasReport, false)
  await memoryDB.confirmArtifact(user.id, first.id, artifact.id, [{ key: 'injury', label: '伤情', value: '更新' }])
  await assert.rejects(memoryDB.publishReport(user.id, first.id, content, snapshot), /REPORT_STALE/)
  assert.equal((await memoryDB.findCaseById(user.id, first.id))?.hasReport, false)
  assert.equal((await memoryDB.findCaseById(user.id, first.id))?.status, 'collecting')
  await memoryDB.confirmArtifact(user.id, first.id, artifact.id, [{ key: 'injury', label: '伤情', value: '更新' }])
  assert.equal((await memoryDB.findCaseById(user.id, first.id))?.materialCount, 1)
})

test('PostgreSQL publication locks owner, validates snapshot and rolls back stale output', async () => {
  const calls: string[] = []
  const connect = mock.method(Pool.prototype, 'connect', async () => ({
    query: async (sql: string, values?: unknown[]) => {
      calls.push(sql)
      if (sql.startsWith('SELECT id FROM cases')) {
        assert.deepEqual(values, ['case', 'owner'])
        assert.match(sql, /FOR UPDATE/)
        return { rows: [{ id: 'case' }] }
      }
      return { rows: [] }
    }, release() {},
  }))
  try {
    await assert.rejects(postgresDB.publishReport('owner', 'case', content, 'outdated'), /REPORT_STALE/)
    assert.ok(calls.includes('ROLLBACK'))
    assert.equal(calls.some(sql => sql.startsWith('INSERT')), false)
  } finally { connect.mock.restore() }
})

test('POST and GET reports use the same wrapper and stale GET is rejected', async () => {
  const { user, first, artifact } = await fixture()
  const previous = generate
  try {
    generate = async (_facts, caseId) => ({ ...content, caseId })
    const generated = await route('post', '/generate', { userId: user.id, body: { caseId: first.id } })
    assert.equal(generated.status, 200)
    assert.equal(generated.payload.data.report.caseId, first.id)
    const retrieved = await route('get', '/:caseId', { userId: user.id, params: { caseId: first.id } })
    assert.deepEqual(retrieved.payload.data, generated.payload.data)
    await memoryDB.confirmArtifact(user.id, first.id, artifact.id, [{ key: 'injury', label: '伤情', value: '变化' }])
    assert.equal((await route('get', '/:caseId', { userId: user.id, params: { caseId: first.id } })).status, 409)
    generate = async (_facts, caseId) => {
      await memoryDB.confirmArtifact(user.id, first.id, artifact.id, [{ key: 'injury', label: '伤情', value: '再次变化' }])
      return { ...content, caseId }
    }
    assert.equal((await route('post', '/generate', { userId: user.id, body: { caseId: first.id } })).status, 409)
  } finally { generate = previous }
})
