import assert from 'node:assert/strict'
import { test } from 'node:test'
import { materialSnapshot } from '../src/services/material-snapshot'

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
  const entitlement = await memoryDB.getOrCreateCaseEntitlement(user.id, caseData.id)
  entitlement.status = 'paid'
  await memoryDB.publishRunReport(reportRun.run.id, { liability: '待定' }, { userId: user.id, materialSnapshot: materialSnapshot([]) })
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

  const entitlement = await memoryDB.getOrCreateCaseEntitlement(user.id, caseData.id)
  entitlement.status = 'paid'
  await assert.rejects(memoryDB.publishRunReport(first.run.id, { liability: '待分析' }, { userId: user.id, materialSnapshot: materialSnapshot([]) }), /STALE_INPUT_REVISION/)
  assert.equal((await memoryDB.findAgentRun(first.run.id))?.status, 'stale')
})

test('only one concurrent claimant starts a queued run', async () => {
  const user = await memoryDB.createUser(`harness-claim-${Date.now()}`)
  const caseData = await memoryDB.createCase(user.id, 'Concurrent claim')
  const { run } = await memoryDB.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'v1' })
  const claims = await Promise.all(Array.from({ length: 8 }, () => memoryDB.claimAgentRun(run.id)))
  assert.equal(claims.filter(Boolean).length, 1)
  assert.equal((await memoryDB.findAgentRun(run.id))?.status, 'running')
})

test('publication rechecks ownership, payment and material snapshot', async () => {
  const user = await memoryDB.createUser(`harness-publish-${Date.now()}`)
  const caseData = await memoryDB.createCase(user.id, 'Publication guards')
  const { run } = await memoryDB.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'v1' })
  await memoryDB.claimAgentRun(run.id)
  const snapshot = materialSnapshot([])
  await assert.rejects(memoryDB.publishRunReport(run.id, {}, { userId: 'another-user', materialSnapshot: snapshot }), /CASE_NOT_FOUND/)
  await assert.rejects(memoryDB.publishRunReport(run.id, {}, { userId: user.id, materialSnapshot: snapshot }), /PAYMENT_REQUIRED/)
  const entitlement = await memoryDB.getOrCreateCaseEntitlement(user.id, caseData.id)
  entitlement.status = 'paid'
  await assert.rejects(memoryDB.publishRunReport(run.id, {}, { userId: user.id, materialSnapshot: 'old-snapshot' }), /REPORT_STALE/)
  assert.equal((await memoryDB.findCaseById(user.id, caseData.id))?.hasReport, false)
  assert.equal((await memoryDB.findAgentRun(run.id))?.status, 'running')
})

test('concurrent run publication is idempotent and transitions once', async () => {
  const user = await memoryDB.createUser(`harness-publish-race-${Date.now()}`)
  const caseData = await memoryDB.createCase(user.id, 'Concurrent publication')
  const { run } = await memoryDB.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'race' })
  await memoryDB.claimAgentRun(run.id)
  const entitlement = await memoryDB.getOrCreateCaseEntitlement(user.id, caseData.id)
  entitlement.status = 'paid'
  const snapshot = materialSnapshot([])
  const results = await Promise.allSettled([
    memoryDB.publishRunReport(run.id, { liability: '分析' }, { userId: user.id, materialSnapshot: snapshot }),
    memoryDB.publishRunReport(run.id, { liability: '分析' }, { userId: user.id, materialSnapshot: snapshot }),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
  assert.deepEqual((await memoryDB.getRunEvents(user.id, caseData.id, run.id))?.map(event => event.status), ['queued', 'running', 'succeeded'])
})

test('run trace records only safe lifecycle fields and requires ownership', async () => {
  const user = await memoryDB.createUser(`harness-trace-${Date.now()}`)
  const caseData = await memoryDB.createCase(user.id, 'Trace privacy')
  const { run } = await memoryDB.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'v1' })
  await memoryDB.claimAgentRun(run.id)
  await memoryDB.updateAgentRun(run.id, { status: 'failed', safeErrorCode: 'REPORT_GENERATION_FAILED', output: { privateText: '敏感病历原文' } })
  const events = await memoryDB.getRunEvents(user.id, caseData.id, run.id)
  assert.deepEqual(events?.map(event => event.status), ['queued', 'running', 'failed'])
  assert.equal(JSON.stringify(events).includes('敏感病历原文'), false)
  assert.equal(await memoryDB.getRunEvents('other-user', caseData.id, run.id), null)
  assert.equal(await memoryDB.getRunEvents(user.id, 'other-case', run.id), null)
})

test('memory publication and failure updates serialize in either order', async () => {
  for (const publishFirst of [true, false]) {
    const user = await memoryDB.createUser(`run-race-${Math.random()}`)
    const caseData = await memoryDB.createCase(user.id, 'Run race')
    const { run } = await memoryDB.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'race' })
    await memoryDB.claimAgentRun(run.id)
    const entitlement = await memoryDB.getOrCreateCaseEntitlement(user.id, caseData.id)
    entitlement.status = 'paid'
    const publish = () => memoryDB.publishRunReport(run.id, { analysis: 'original' }, { userId: user.id, materialSnapshot: materialSnapshot([]) })
    const fail = () => memoryDB.updateAgentRun(run.id, { status: 'failed', safeErrorCode: 'REPORT_GENERATION_FAILED' })
    const results = await Promise.allSettled(publishFirst ? [publish(), fail()] : [fail(), publish()])
    assert.equal(results[0].status, 'fulfilled')
    assert.equal(results[1].status, 'rejected')
    assert.equal((await memoryDB.findAgentRun(run.id))?.status, publishFirst ? 'succeeded' : 'failed')
    assert.equal(Boolean(await memoryDB.getReportByCase(caseData.id)), publishFirst)
    assert.deepEqual((await memoryDB.getRunEvents(user.id, caseData.id, run.id))?.map(event => event.status), ['queued', 'running', publishFirst ? 'succeeded' : 'failed'])
  }
})

for (const status of ['succeeded', 'failed', 'stale', 'cancelled'] as const) {
  test(`memory preserves the entire ${status} run after every subsequent update`, async () => {
    const user = await memoryDB.createUser(`terminal-${Math.random()}`)
    const caseData = await memoryDB.createCase(user.id, 'Immutable terminal')
    const { run } = await memoryDB.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'terminal' })
    await memoryDB.claimAgentRun(run.id)
    await memoryDB.updateAgentRun(run.id, { status, output: { original: true } })
    const before = JSON.stringify(await memoryDB.findAgentRun(run.id))
    const eventsBefore = JSON.stringify(await memoryDB.getRunEvents(user.id, caseData.id, run.id))
    for (const next of ['queued', 'running', 'succeeded', 'failed', 'stale', 'cancelled'] as const) {
      await assert.rejects(memoryDB.updateAgentRun(run.id, { status: next, output: { overwritten: true }, safeErrorCode: 'LATE_FAILURE' }), /INVALID_AGENT_RUN_TRANSITION/)
    }
    assert.equal(JSON.stringify(await memoryDB.findAgentRun(run.id)), before)
    assert.equal(JSON.stringify(await memoryDB.getRunEvents(user.id, caseData.id, run.id)), eventsBefore)
  })
}

test('memory revision changes serialize with creation and stale creation records no run event', async () => {
  const user = await memoryDB.createUser(`revision-race-${Math.random()}`)
  const caseData = await memoryDB.createCase(user.id, 'Revision race')
  const input = { caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'revision-race' }
  const change = memoryDB.persistConfirmedFacts(user.id, caseData.id, [{ key: 'location', label: '地点', value: '杭州', source: 'user_text' }])
  const results = await Promise.allSettled([change, memoryDB.createAgentRun(input)])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  if (results[1].status === 'rejected') assert.match(results[1].reason.message, /STALE_INPUT_REVISION/)
  assert.equal(await memoryDB.findLatestReportRun(caseData.id, 0), null)
  const current = await memoryDB.createAgentRun({ ...input, inputRevision: 1 })
  assert.equal(current.created, true)
  assert.deepEqual((await memoryDB.getRunEvents(user.id, caseData.id, current.run.id))?.map(event => event.status), ['queued'])
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

  const entitlement = await memoryDB.getOrCreateCaseEntitlement(user.id, caseData.id)
  entitlement.status = 'paid'
  const report = await memoryDB.publishRunReport(created.run.id, { liability: '主责' }, { userId: user.id, materialSnapshot: materialSnapshot([]) })
  assert.equal(report.inputRevision, 0)
  assert.equal(report.agentRunId, created.run.id)
  assert.equal((await memoryDB.findAgentRun(created.run.id))?.status, 'succeeded')
  await assert.rejects(memoryDB.updateAgentRun(created.run.id, { status: 'failed' }), /INVALID_AGENT_RUN_TRANSITION/)
})
