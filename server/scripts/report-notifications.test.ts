import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

process.env.DB_TYPE = 'memory'
process.env.NODE_ENV = 'test'
process.env.WECHAT_APP_ID = 'test-app-id'
process.env.WECHAT_APP_SECRET = 'test-app-secret'
process.env.WECHAT_REPORT_SUBSCRIBE_TEMPLATE_ID = 'test-template'
process.env.WECHAT_REPORT_SUBSCRIBE_TITLE_FIELD = 'thing1'
process.env.WECHAT_REPORT_SUBSCRIBE_STATUS_FIELD = 'thing2'
process.env.WECHAT_REPORT_SUBSCRIBE_TIME_FIELD = 'time3'

const { memoryDB: db } = require('../src/db/memory') as typeof import('../src/db/memory')
const {
  createReportNotificationSubscription,
  deliverReportNotificationForRun,
  linkReportNotificationToRun,
  reportNotificationConfig,
} = require('../src/services/report-notifications') as typeof import('../src/services/report-notifications')

async function fixture() {
  const user = await db.createUser(`notification-${randomUUID()}`)
  const caseItem = await db.createCase(user.id, '提醒测试案件')
  const authorization = await createReportNotificationSubscription(user.id, caseItem.id)
  return { user, caseItem, subscriptionId: authorization.subscriptionId }
}

test('report notification config enables only when all template fields are distinct', () => {
  assert.deepEqual(reportNotificationConfig(), { enabled: true, templateId: 'test-template' })
})

test('subscription is bound to its owner, case and one report run', async () => {
  const item = await fixture()
  assert.equal(await linkReportNotificationToRun(item.subscriptionId, 'other-user', item.caseItem.id, 'run-a'), false)
  assert.equal(await linkReportNotificationToRun(item.subscriptionId, item.user.id, 'other-case', 'run-a'), false)
  assert.equal(await linkReportNotificationToRun(item.subscriptionId, item.user.id, item.caseItem.id, 'run-a'), true)
  assert.equal(await linkReportNotificationToRun(item.subscriptionId, item.user.id, item.caseItem.id, 'run-a'), true)
  assert.equal(await linkReportNotificationToRun(item.subscriptionId, item.user.id, item.caseItem.id, 'run-b'), false)
})

test('concurrent completion attempts send one subscribed notification', async () => {
  const item = await fixture()
  assert.equal(await linkReportNotificationToRun(item.subscriptionId, item.user.id, item.caseItem.id, 'run-once'), true)

  let startSender!: () => void
  let finishSender!: () => void
  const senderStarted = new Promise<void>(resolve => { startSender = resolve })
  const senderGate = new Promise<void>(resolve => { finishSender = resolve })
  let sends = 0
  const sender = async (input: { openid: string; templateId: string; caseId: string }) => {
    sends++
    assert.equal(input.openid, item.user.openid)
    assert.equal(input.templateId, 'test-template')
    assert.equal(input.caseId, item.caseItem.id)
    startSender()
    await senderGate
  }

  const first = deliverReportNotificationForRun('run-once', sender)
  await senderStarted
  assert.equal(await deliverReportNotificationForRun('run-once', sender), false)
  finishSender()
  assert.equal(await first, true)
  assert.equal(sends, 1)
  assert.equal(await deliverReportNotificationForRun('run-once', sender), false)
})

test('a failed optional notification is consumed without throwing into report completion', async () => {
  const item = await fixture()
  assert.equal(await linkReportNotificationToRun(item.subscriptionId, item.user.id, item.caseItem.id, 'run-failure'), true)
  let sends = 0
  const sender = async () => {
    sends++
    throw new Error('simulated provider failure')
  }

  await assert.doesNotReject(deliverReportNotificationForRun('run-failure', sender))
  assert.equal(await deliverReportNotificationForRun('run-failure', sender), false)
  assert.equal(sends, 1)
})
