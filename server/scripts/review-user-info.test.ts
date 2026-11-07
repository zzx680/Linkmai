import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DB_TYPE = 'memory'
process.env.NODE_ENV = 'test'

const { memoryDB: db } = require('../src/db/memory') as typeof import('../src/db/memory')
const { WorkflowStore, id } = require('../src/harness/store') as typeof import('../src/harness/store')
const { HarnessService } = require('../src/harness/service') as typeof import('../src/harness/service')
const { expenseDefinitions } = require('../src/harness/calculator') as typeof import('../src/harness/calculator')
const { coreTrafficLegalDocuments, coreTrafficLegalSections } = require('../src/legal/core-traffic-law') as typeof import('../src/legal/core-traffic-law')

const store = new WorkflowStore(false)
const service = new HarnessService(store)
const version = { id: 'compensation-v1', status: 'approved' as const, legalRefs: ['cn-civil-code-2021-art-1179'], reviewedBy: 'lawyer' }

async function reviewFixture(phone?: string) {
  await db.upsertLegalCorpus(coreTrafficLegalDocuments, coreTrafficLegalSections)
  const admin = id(), lawyer = id(), other = id()
  await store.control(control => {
    control.calculators = [version]
    control.parameters = []
    control.reviewers.push(...[
      { id: admin, role: 'review_admin' as const },
      { id: lawyer, role: 'reviewer' as const },
      { id: other, role: 'reviewer' as const },
    ].map(reviewer => ({ ...reviewer, email: `${reviewer.id}@example.test`, passwordHash: 'not-a-real-password', active: true })))
  })

  const user = await db.createUser(`review-user-${id()}`)
  if (phone) await db.updateUser(user.id, { phone })
  const item = await db.createCase(user.id, '用户信息脱敏测试案件')
  const entitlement = await db.getOrCreateCaseEntitlement(user.id, item.id)
  entitlement.status = 'paid'
  await db.persistConfirmedFacts(user.id, item.id, [
    ['accident_date', '2026-10-20'], ['jurisdiction', 'CN-ZJ-HZ'], ['injury_severity', 'minor'],
    ['risk_screened', 'yes'], ['has_liability_document', 'yes'], ...expenseDefinitions.map(definition => [`claim_${definition.code}`, 'no']),
  ].map(([key, value]) => ({ key, label: key, value, source: 'user_text' })))

  const run = await service.enqueue(user.id, item.id)
  const claim = await service.claim(user.id, item.id, 'review-user-info-test-worker')
  assert.ok(claim)
  await service.complete(user.id, item.id, run.runId, claim.run.leaseToken!)
  const document = (await service.get(user.id, item.id)).documents.find(candidate => candidate.type === 'case_report' && candidate.status === 'draft')
  assert.ok(document)
  const confirmed = await service.confirm(user.id, item.id, document.id, 'review-v1')
  assert.ok(confirmed.reviewTaskId)
  await service.reviewAction(admin, item.id, confirmed.reviewTaskId, 'assign', { reviewerId: lawyer })
  return { admin, lawyer, other, userId: user.id, caseId: item.id, taskId: confirmed.reviewTaskId }
}

test('审核队列与任务详情仅返回用户电话后四位', async () => {
  const assigned = await reviewFixture('13812345678')
  const unlisted = await reviewFixture()

  const queue = await service.reviewQueue(assigned.lawyer)
  const assignedTask = queue.find(task => task.id === assigned.taskId)
  const unlistedTask = (await service.reviewQueue(unlisted.lawyer)).find(task => task.id === unlisted.taskId)
  assert.equal(assignedTask?.phoneLastFour, '5678')
  assert.equal(unlistedTask?.phoneLastFour, null)
  assert.equal(queue.some(task => task.id === unlisted.taskId), false)

  const opened = await service.reviewAction(assigned.lawyer, assigned.caseId, assigned.taskId, 'open', {})
  assert.deepEqual(opened.userInfo, { phoneLastFour: '5678', caseCreated: (await db.findCaseById(assigned.userId, assigned.caseId))!.createdAt.getTime() })
  assert.equal(JSON.stringify(opened).includes('13812345678'), false)
  await assert.rejects(service.reviewAction(assigned.other, assigned.caseId, assigned.taskId, 'open', {}), /REVIEWER_FORBIDDEN/)
})
