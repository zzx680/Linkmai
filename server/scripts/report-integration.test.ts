import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { Pool } from 'pg'
import { db as postgresDB } from '../src/db/postgres'
import { memoryDB } from '../src/db/memory'
import { materialSnapshot } from '../src/services/material-snapshot'
let generate: (facts: unknown[], caseId: string) => Promise<unknown> = async (_facts, caseId) => ({ ...content, caseId })
let checkPayment: () => Promise<unknown> = async () => undefined
for (const [path, exports] of [
  ['../src/services/report', { generateReport: (facts: unknown[], caseId: string) => generate(facts, caseId) }],
  ['../src/services/payment', { requirePaidEntitlement: () => checkPayment() }],
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
  const entitlement = await memoryDB.getOrCreateCaseEntitlement(user.id, first.id)
  entitlement.status = 'paid'
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

test('latest report run recovery is owned, revision-bound and excludes other tasks', async () => {
  const { user, first, second } = await fixture()
  const params = { caseId: first.id }
  assert.equal((await route('get', '/:caseId/runs/latest', { userId: user.id, params })).payload.data, null)
  const current = await memoryDB.findCaseById(user.id, first.id)
  const { run } = await memoryDB.createAgentRun({ caseId: first.id, task: 'report', inputRevision: current!.inputRevision, skillVersion: 'restore' })
  await memoryDB.claimAgentRun(run.id)
  await memoryDB.createAgentRun({ caseId: first.id, task: 'conversation', inputRevision: current!.inputRevision, skillVersion: 'restore' })
  const recovered = await route('get', '/:caseId/runs/latest', { userId: user.id, params })
  assert.equal(recovered.payload.data.runId, run.id)
  assert.equal(recovered.payload.data.status, 'running')
  assert.equal('output' in recovered.payload.data, false)
  assert.equal((await route('get', '/:caseId/runs/latest', { params })).status, 401)
  assert.equal((await route('get', '/:caseId/runs/latest', { userId: 'other', params })).status, 404)
  assert.equal((await route('get', '/:caseId/runs/latest', { userId: user.id, params: { caseId: second.id } })).payload.data, null)
  await memoryDB.persistConfirmedFacts(user.id, first.id, [{ key: 'location', label: '地点', value: '杭州', source: 'user_text' }])
  assert.equal((await route('get', '/:caseId/runs/latest', { userId: user.id, params })).payload.data, null)
})

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

test('PostgreSQL run publication rejects lost entitlement inside the transaction', async () => {
  const queries: string[] = []
  const client = { query: async (sql: string) => {
    queries.push(sql)
    if (sql.includes('SELECT ar.*')) {
      assert.match(sql, /FOR UPDATE OF ar,c/)
      return { rows: [{ id: 'run', case_id: 'case', owner_id: 'owner', status: 'running', input_revision: 1, current_revision: 1 }] }
    }
    if (sql.includes('SELECT status FROM case_entitlements')) return { rows: [{ status: 'refunded' }] }
    return { rows: [] }
  }, release: () => undefined }
  const stub = mock.method(Pool.prototype, 'connect', async () => client as never)
  try {
    await assert.rejects(postgresDB.publishRunReport('run', content, { userId: 'owner', materialSnapshot: materialSnapshot([]) }), /PAYMENT_REQUIRED/)
    assert.equal(queries.includes('ROLLBACK'), true)
    assert.equal(queries.some(sql => sql.includes('INSERT INTO reports')), false)
  } finally { stub.mock.restore() }
})

test('PostgreSQL run publication rejects changed materials inside the transaction', async () => {
  const queries: string[] = []
  const client = { query: async (sql: string) => {
    queries.push(sql)
    if (sql.includes('SELECT ar.*')) {
      assert.match(sql, /FOR UPDATE OF ar,c/)
      return { rows: [{ id: 'run', case_id: 'case', owner_id: 'owner', status: 'running', input_revision: 1, current_revision: 1 }] }
    }
    if (sql.includes('SELECT status FROM case_entitlements')) return { rows: [{ status: 'paid' }] }
    if (sql.includes('SELECT * FROM artifacts')) return { rows: [] }
    return { rows: [] }
  }, release: () => undefined }
  const stub = mock.method(Pool.prototype, 'connect', async () => client as never)
  try {
    await assert.rejects(postgresDB.publishRunReport('run', content, { userId: 'owner', materialSnapshot: 'outdated' }), /REPORT_STALE/)
    assert.equal(queries.includes('ROLLBACK'), true)
    assert.equal(queries.some(sql => sql.includes('INSERT INTO reports')), false)
  } finally { stub.mock.restore() }
})

test('run status queries enforce case ownership and do not expose model output', async () => {
  const { user, first, second } = await fixture()
  const currentCase = await memoryDB.findCaseById(user.id, first.id)
  const { run } = await memoryDB.createAgentRun({ caseId: first.id, task: 'report', inputRevision: currentCase!.inputRevision, skillVersion: 'status-test' })
  await memoryDB.claimAgentRun(run.id)
  const result = await route('get', '/:caseId/runs/:runId', { userId: user.id, params: { caseId: first.id, runId: run.id } })
  assert.equal(result.status, 200)
  assert.equal(result.payload.data.status, 'running')
  assert.equal('output' in result.payload.data, false)
  assert.equal((await route('get', '/:caseId/runs/:runId', { userId: 'other-user', params: { caseId: first.id, runId: run.id } })).status, 404)
  assert.equal((await route('get', '/:caseId/runs/:runId', { userId: user.id, params: { caseId: second.id, runId: run.id } })).status, 404)
  await memoryDB.persistConfirmedFacts(user.id, first.id, [{ key: 'accident_date', label: '事故日期', value: '2026-10-22', source: 'user_text' }])
  const stale = await route('get', '/:caseId/runs/:runId', { userId: user.id, params: { caseId: first.id, runId: run.id } })
  assert.equal(stale.payload.data.status, 'stale')
})

test('report inputs include both conversation facts and confirmed materials', async () => {
  const { user, first } = await fixture()
  await memoryDB.persistConfirmedFacts(user.id, first.id, [{ key: 'accident_date', label: '事故日期', value: '2026-10-22', source: 'user_text' }])
  const previous = generate
  try {
    generate = async (facts, caseId) => {
      assert.deepEqual(facts.map((fact: any) => fact.key).sort(), ['accident_date', 'injury'])
      return { ...content, caseId }
    }
    assert.equal((await route('post', '/generate', { userId: user.id, body: { caseId: first.id } })).status, 200)
  } finally { generate = previous }
})

test('conflicting confirmed sources block report generation before a model call', async () => {
  const { user, first } = await fixture()
  await memoryDB.persistConfirmedFacts(user.id, first.id, [{ key: 'injury', label: '伤情', value: '无伤', source: 'user_text' }])
  const previous = generate
  let calls = 0
  try {
    generate = async (_facts, caseId) => { calls += 1; return { ...content, caseId } }
    const result = await route('post', '/generate', { userId: user.id, body: { caseId: first.id } })
    assert.equal(result.status, 409)
    assert.equal(result.payload.code, 'FACT_CONFLICT')
    assert.equal(calls, 0)
  } finally { generate = previous }
})

test('concurrent report requests call the model only once', async () => {
  const { user, first } = await fixture()
  const previous = generate
  let release!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  let calls = 0
  try {
    generate = async (_facts, caseId) => {
      calls += 1
      await blocked
      return { ...content, caseId }
    }
    const requests = Array.from({ length: 8 }, () => route('post', '/generate', { userId: user.id, body: { caseId: first.id } }))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(calls, 1)
    release()
    const results = await Promise.all(requests)
    assert.equal(results.filter(result => result.status === 200).length, 1)
    assert.equal(results.filter(result => result.status === 202).length, 7)
  } finally { release(); generate = previous }
})

test('a refund completed during generation prevents returning the paid report', async () => {
  const { user, first } = await fixture()
  const previous = generate
  try {
    generate = async (_facts, caseId) => {
      checkPayment = async () => { throw new Error('PAYMENT_REQUIRED') }
      return { ...content, caseId }
    }
    const result = await route('post', '/generate', { userId: user.id, body: { caseId: first.id } })
    assert.equal(result.status, 402)
    assert.equal(result.payload.data, undefined)
  } finally { generate = previous; checkPayment = async () => undefined }
})

test('export database failures return a controlled response instead of an unhandled rejection', async () => {
  const stub = mock.method(memoryDB, 'findCaseById', async () => { throw new Error('connection failed') })
  try {
    const result = await route('post', '/:caseId/export', { userId: 'owner', params: { caseId: 'case' }, body: { format: 'pdf' } })
    assert.equal(result.status, 500)
  } finally { stub.mock.restore() }
})
