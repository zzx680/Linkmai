import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { Pool } from 'pg'
import { db as postgresDB } from '../src/db/postgres'
import { memoryDB } from '../src/db/memory'
import { materialSnapshot } from '../src/services/material-snapshot'
let generate: (context: { facts: any[]; caseId?: string; accidentDate: string; legalReferences: any[] }) => Promise<unknown> = async context => ({ ...content, caseId: context.caseId })
let checkPayment: () => Promise<unknown> = async () => undefined
for (const [path, exports] of [
  ['../src/services/report', { CASE_REPORT_SKILL_VERSION: 'traffic-report-v3', generateReport: (context: any) => generate(context) }],
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
  await memoryDB.persistConfirmedFacts(user.id, first.id, [{ key: 'accident_date', label: '事故日期', value: '2026-10-22', source: 'user_text' }])
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

test('PostgreSQL createAgentRun reuses an existing run when either equivalent unique key conflicts', async () => {
  const existing = {
    id: 'run-existing', case_id: 'case', task: 'report', input_revision: 3,
    skill_version: 'v1', idempotency_key: 'existing-key', status: 'queued',
    output: null, safe_error_code: null, started_at: null, completed_at: null,
    created_at: new Date(), updated_at: new Date(),
  }
  const calls: string[] = []
  const query = mock.method(Pool.prototype, 'connect', async () => ({ query: async (sql: string) => {
    calls.push(sql)
    if (sql.startsWith('SELECT input_revision')) {
      assert.match(sql, /FOR UPDATE$/)
      return { rows: [{ input_revision: 3 }] }
    }
    if (sql.startsWith('INSERT INTO agent_runs')) return { rows: [] }
    if (sql.startsWith('SELECT * FROM agent_runs')) return { rows: [existing] }
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
    throw new Error(`unexpected query: ${sql}`)
  }, release() {} }))
  try {
    const result = await postgresDB.createAgentRun({ caseId: 'case', task: 'report', inputRevision: 3, skillVersion: 'v1' })
    assert.equal(result.created, false)
    assert.equal(result.run.id, 'run-existing')
    assert.equal(calls[0], 'BEGIN')
    assert.equal(calls.at(-1), 'COMMIT')
    assert.ok(calls.findIndex(sql => sql.includes('FOR UPDATE')) < calls.findIndex(sql => sql.startsWith('INSERT')))
    assert.match(calls.find(sql => sql.startsWith('INSERT INTO agent_runs'))!, /ON CONFLICT DO NOTHING/)
    assert.doesNotMatch(calls.find(sql => sql.startsWith('INSERT INTO agent_runs'))!, /ON CONFLICT \(idempotency_key\)/)
  } finally { query.mock.restore() }
})

test('PostgreSQL updateAgentRun explicitly types reused status parameters', async () => {
  const current = {
    id: 'run', case_id: 'case', task: 'report', input_revision: 1,
    skill_version: 'v1', idempotency_key: 'key', status: 'running',
    output: null, safe_error_code: null, started_at: new Date(), completed_at: null,
    created_at: new Date(), updated_at: new Date(),
  }
  const calls: string[] = []
  const query = mock.method(Pool.prototype, 'connect', async () => ({ query: async (sql: string, values?: unknown[]) => {
    calls.push(sql)
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
    if (sql.startsWith('SELECT * FROM agent_runs')) {
      assert.match(sql, /FOR UPDATE$/)
      return { rows: [current] }
    }
    assert.match(sql, /status=\$1::varchar/)
    assert.match(sql, /\$1::varchar=ANY\(\$4::varchar\[\]\)/)
    assert.match(sql, /WHERE id=\$5 AND status=\$6 RETURNING/)
    assert.equal(values?.[5], 'running')
    return { rows: [{ ...current, status: 'failed', safe_error_code: 'REPORT_STALE' }] }
  }, release() {} }))
  try {
    assert.equal((await postgresDB.updateAgentRun('run', { status: 'failed', safeErrorCode: 'REPORT_STALE' }))?.status, 'failed')
    assert.equal(calls[0], 'BEGIN')
    assert.equal(calls.at(-1), 'COMMIT')
  } finally { query.mock.restore() }
})

test('PostgreSQL creation rejects a changed case revision before inserting a run', async () => {
  const calls: string[] = []
  let released = false
  const connect = mock.method(Pool.prototype, 'connect', async () => ({
    query: async (sql: string) => {
      calls.push(sql)
      if (sql.startsWith('SELECT input_revision')) {
        assert.match(sql, /FOR UPDATE$/)
        return { rows: [{ input_revision: 4 }] }
      }
      return { rows: [] }
    },
    release() { released = true },
  }))
  try {
    await assert.rejects(postgresDB.createAgentRun({ caseId: 'case', task: 'report', inputRevision: 3, skillVersion: 'v1' }), /STALE_INPUT_REVISION/)
    assert.deepEqual(calls, ['BEGIN', 'SELECT input_revision FROM cases WHERE id=$1 FOR UPDATE', 'ROLLBACK'])
    assert.equal(released, true)
  } finally { connect.mock.restore() }
})

for (const status of ['succeeded', 'failed', 'stale', 'cancelled'] as const) {
  test(`PostgreSQL rejects every update of a ${status} run, including the same status`, async () => {
    const calls: string[] = []
    const connect = mock.method(Pool.prototype, 'connect', async () => ({
      query: async (sql: string) => {
        calls.push(sql)
        if (sql.startsWith('SELECT * FROM agent_runs')) {
          assert.match(sql, /FOR UPDATE$/)
          return { rows: [{ id: 'run', status }] }
        }
        return { rows: [] }
      }, release() {},
    }))
    try {
      for (const next of ['queued', 'running', 'succeeded', 'failed', 'stale', 'cancelled'] as const) {
        await assert.rejects(postgresDB.updateAgentRun('run', { status: next, output: { overwritten: true } }), /INVALID_AGENT_RUN_TRANSITION/)
      }
      assert.equal(calls.filter(sql => sql === 'ROLLBACK').length, 6)
      assert.equal(calls.some(sql => sql.startsWith('UPDATE')), false)
    } finally { connect.mock.restore() }
  })
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

test('missing exact accident date is rejected before an AgentRun is created', async () => {
  const user = await memoryDB.createUser(`report-no-date-${Math.random()}`)
  const currentCase = await memoryDB.createCase(user.id, { title: 'No date' })
  await memoryDB.persistConfirmedFacts(user.id, currentCase.id, [{ key: 'location', label: '地点', value: '杭州', source: 'user_text' }])
  const entitlement = await memoryDB.getOrCreateCaseEntitlement(user.id, currentCase.id)
  entitlement.status = 'paid'
  const result = await route('post', '/generate', { userId: user.id, body: { caseId: currentCase.id } })
  assert.equal(result.status, 400)
  assert.match(result.payload.error, /YYYY-MM-DD/)
  assert.equal(await memoryDB.findLatestReportRun(currentCase.id, currentCase.inputRevision), null)
})

test('POST and GET reports use the same wrapper and stale GET is rejected', async () => {
  const { user, first, artifact } = await fixture()
  const previous = generate
  try {
    generate = async context => ({ ...content, caseId: context.caseId })
    const generated = await route('post', '/generate', { userId: user.id, body: { caseId: first.id } })
    assert.equal(generated.status, 200)
    assert.equal(generated.payload.data.report.caseId, first.id)
    const retrieved = await route('get', '/:caseId', { userId: user.id, params: { caseId: first.id } })
    assert.deepEqual(retrieved.payload.data, generated.payload.data)
    await memoryDB.confirmArtifact(user.id, first.id, artifact.id, [{ key: 'injury', label: '伤情', value: '变化' }])
    assert.equal((await route('get', '/:caseId', { userId: user.id, params: { caseId: first.id } })).status, 409)
    generate = async context => {
      await memoryDB.confirmArtifact(user.id, first.id, artifact.id, [{ key: 'injury', label: '伤情', value: '再次变化' }])
      return { ...content, caseId: context.caseId }
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
  await memoryDB.persistConfirmedFacts(user.id, first.id, [{ key: 'accident_date', label: '事故日期', value: '2026-10-23', source: 'user_text' }])
  const stale = await route('get', '/:caseId/runs/:runId', { userId: user.id, params: { caseId: first.id, runId: run.id } })
  assert.equal(stale.payload.data.status, 'stale')
})

test('report inputs include both conversation facts and confirmed materials', async () => {
  const { user, first } = await fixture()
  await memoryDB.persistConfirmedFacts(user.id, first.id, [{ key: 'accident_date', label: '事故日期', value: '2026-10-22', source: 'user_text' }])
  const previous = generate
  try {
    generate = async context => {
      assert.deepEqual(context.facts.map((fact: any) => fact.key).sort(), ['accident_date', 'injury'])
      assert.equal(context.caseId, first.id)
      assert.equal(context.accidentDate, '2026-10-22')
      assert.ok(context.legalReferences.length > 0)
      return { ...content, caseId: context.caseId }
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
    generate = async context => { calls += 1; return { ...content, caseId: context.caseId } }
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
    generate = async context => {
      calls += 1
      await blocked
      return { ...content, caseId: context.caseId }
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

test('a failed report run can retry successfully on the same input revision', async () => {
  const { user, first } = await fixture()
  const previous = generate
  let calls = 0
  try {
    generate = async context => {
      calls += 1
      if (calls === 1) throw new Error('temporary model failure')
      return { ...content, caseId: context.caseId }
    }
    const failed = await route('post', '/generate', { userId: user.id, body: { caseId: first.id } })
    assert.equal(failed.status, 500)
    const currentCase = await memoryDB.findCaseById(user.id, first.id)
    const failedRun = await memoryDB.findLatestReportRun(first.id, currentCase!.inputRevision)
    assert.equal(failedRun?.status, 'failed')
    const retried = await route('post', '/generate', { userId: user.id, body: { caseId: first.id } })
    assert.equal(retried.status, 200)
    const succeededRun = await memoryDB.findLatestReportRun(first.id, currentCase!.inputRevision)
    assert.equal(succeededRun?.id, failedRun?.id)
    assert.equal(succeededRun?.status, 'succeeded')
    assert.equal(calls, 2)
  } finally { generate = previous }
})

test('a refund completed during generation prevents returning the paid report', async () => {
  const { user, first } = await fixture()
  const previous = generate
  try {
    generate = async context => {
      checkPayment = async () => { throw new Error('PAYMENT_REQUIRED') }
      return { ...content, caseId: context.caseId }
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
