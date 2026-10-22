import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DB_TYPE = 'memory'

const { memoryDB } = require('../src/db/memory') as typeof import('../src/db/memory')

test('confirmed facts only advance revision when values change', async () => {
  const user = await memoryDB.createUser(`harness-user-${Date.now()}`)
  const caseData = await memoryDB.createCase(user.id, 'Harness facts')
  const facts = [{
    key: 'accident_date',
    label: '事故日期',
    value: '2026-10-22',
    source: 'user_text',
    confidence: 'high',
  }]

  const first = await memoryDB.persistConfirmedFacts(user.id, caseData.id, facts)
  assert.equal(first.changed, true)
  assert.equal(first.inputRevision, 1)
  assert.equal(first.facts[0].sourceType, 'conversation')

  const duplicate = await memoryDB.persistConfirmedFacts(user.id, caseData.id, facts)
  assert.equal(duplicate.changed, false)
  assert.equal(duplicate.inputRevision, 1)

  const reportRun = await memoryDB.createAgentRun({
    caseId: caseData.id,
    task: 'report',
    inputRevision: 1,
    skillVersion: 'v1',
  })
  await memoryDB.updateAgentRun(reportRun.run.id, { status: 'running' })
  await memoryDB.publishRunReport(reportRun.run.id, { liability: '待定' })
  assert.equal((await memoryDB.findCaseById(user.id, caseData.id))?.hasReport, true)

  const changed = await memoryDB.persistConfirmedFacts(user.id, caseData.id, [
    { ...facts[0], value: '2026-10-23' },
  ])
  assert.equal(changed.changed, true)
  assert.equal(changed.inputRevision, 2)
  const updatedCase = await memoryDB.findCaseById(user.id, caseData.id)
  assert.equal(updatedCase?.hasReport, false)
  assert.equal(updatedCase?.status, 'collecting')
  assert.deepEqual((await memoryDB.getCaseRevisions(caseData.id)).map(item => item.inputRevision), [1, 2])
})

test('agent runs are idempotent and stale runs cannot publish', async () => {
  const user = await memoryDB.createUser(`harness-run-user-${Date.now()}`)
  const caseData = await memoryDB.createCase(user.id, 'Harness run')
  await memoryDB.persistConfirmedFacts(user.id, caseData.id, [{
    key: 'location', label: '事故地点', value: '杭州', source: 'user_text',
  }])

  const input = { caseId: caseData.id, task: 'report', inputRevision: 1, skillVersion: 'v1' }
  const first = await memoryDB.createAgentRun(input)
  const duplicate = await memoryDB.createAgentRun(input)
  assert.equal(first.created, true)
  assert.equal(duplicate.created, false)
  assert.equal(duplicate.run.id, first.run.id)

  await memoryDB.updateAgentRun(first.run.id, { status: 'running' })
  assert.equal((await memoryDB.createAgentRun(input)).run.status, 'running')
  await memoryDB.persistConfirmedFacts(user.id, caseData.id, [{
    key: 'location', label: '事故地点', value: '宁波', source: 'user_text',
  }])

  await assert.rejects(memoryDB.publishRunReport(first.run.id, { liability: '待分析' }), /STALE_INPUT_REVISION/)
  assert.equal((await memoryDB.findAgentRun(first.run.id))?.status, 'stale')
})

test('successful run publishes one revision-bound report', async () => {
  const user = await memoryDB.createUser(`harness-report-user-${Date.now()}`)
  const caseData = await memoryDB.createCase(user.id, 'Harness report')
  const created = await memoryDB.createAgentRun({
    caseId: caseData.id,
    task: 'report',
    inputRevision: 0,
    skillVersion: 'v1',
  })
  await memoryDB.updateAgentRun(created.run.id, { status: 'running' })

  const report = await memoryDB.publishRunReport(created.run.id, { liability: '主责' })
  assert.equal(report.inputRevision, 0)
  assert.equal(report.agentRunId, created.run.id)
  assert.equal((await memoryDB.findAgentRun(created.run.id))?.status, 'succeeded')
  await assert.rejects(memoryDB.updateAgentRun(created.run.id, { status: 'failed' }), /INVALID_AGENT_RUN_TRANSITION/)
})
