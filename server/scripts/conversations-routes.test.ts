import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import { memoryDB } from '../src/db/memory'
import router from '../src/routes/conversations'

// Invoke only the mounted route handler; no HTTP listener or paid API.
async function request(method: string, body: Record<string, unknown> = {}, query: Record<string, unknown> = {}, userId?: string) {
  const layer = (router as any).stack.find((item: any) => item.route?.path === '/current/messages' && item.route.methods[method])
  let status = 200
  let payload: any
  const res = { status(code: number) { status = code; return this }, json(value: unknown) { payload = value; return this } }
  await layer.route.stack[0].handle({ body, query, userId } as express.Request, res, () => undefined)
  return { status, ...payload }
}

async function fixture() {
  const user = await memoryDB.createUser(`conversations-${Date.now()}-${Math.random()}`)
  const caseData = await memoryDB.createCase(user.id, '对话状态测试')
  return { userId: user.id, caseId: caseData.id }
}

test('message and history require explicit owned case; URL inputs never reach recognition', async () => {
  const own = await fixture()
  const other = await fixture()
  assert.equal((await request('post', { text: '交通事故' })).status, 401)
  assert.equal((await request('post', { text: '交通事故' }, {}, own.userId)).status, 400)
  assert.equal((await request('get', {}, {}, own.userId)).status, 400)
  assert.equal((await request('post', { caseId: other.caseId, text: '交通事故' }, {}, own.userId)).status, 404)
  assert.equal((await request('get', {}, { caseId: other.caseId }, own.userId)).status, 404)
  for (const extra of [{ images: ['http://127.0.0.1/secrets'] }, { imageUrl: 'https://external/image' }, { url: 'https://external/image' }]) {
    assert.equal((await request('post', { caseId: own.caseId, text: '交通事故', ...extra }, {}, own.userId)).status, 400)
  }
  assert.equal((await request('post', { caseId: own.caseId, action: 'unsafe_action' }, {}, own.userId)).status, 400)
  assert.deepEqual((await request('get', {}, { caseId: own.caseId }, own.userId)).data.messages, [])
})

test('history returns saved real agentState and case conversations remain isolated', async () => {
  const own = await fixture()
  let sent: any
  for (const text of ['traffic_accident', '2026年10月1日', '中山路口', '甲方张某乙方王某', '后车追尾']) {
    sent = await request('post', { caseId: own.caseId, text }, {}, own.userId)
    assert.equal(sent.status, 200)
  }
  sent = await request('post', { caseId: own.caseId, action: 'finish' }, {}, own.userId)
  assert.equal(sent.data.agentState.stage, 'ready')
  const history = await request('get', {}, { caseId: own.caseId }, own.userId)
  assert.deepEqual(history.data.agentState, sent.data.agentState)
  assert.equal(history.data.conversationState, 'ready')
  assert.equal(history.data.messages.length, 12)
  const secondCase = await memoryDB.createCase(own.userId, '第二案件')
  assert.deepEqual((await request('get', {}, { caseId: secondCase.id }, own.userId)).data.messages, [])
  assert.equal((await request('get', {}, { caseId: own.caseId }, own.userId)).data.messages.length, 12)
})

test('attach only owned artifacts, import only material-page-confirmed data, do not increment counts', async () => {
  const own = await fixture()
  const other = await fixture()
  const artifact = await memoryDB.createArtifact({ caseId: own.caseId, name: '认定书', type: 'accident_report', ossUrl: 'https://storage.local/file', ossKey: 'file', fileSize: 123, mimeType: 'image/png', status: 'processed', metadata: { confirmed: false, fields: [{ key: 'accident_date', label: '事故日期', value: '2026-10-01' }] } })
  assert.equal((await request('post', { caseId: other.caseId, artifactIds: [artifact.id] }, {}, other.userId)).status, 404)
  assert.equal((await request('post', { caseId: own.caseId, artifactIds: ['missing'] }, {}, own.userId)).status, 404)
  const attached = await request('post', { caseId: own.caseId, artifactIds: [artifact.id] }, {}, own.userId)
  assert.equal(attached.status, 200)
  assert.equal(attached.data.agentState.collectedFacts.length, 0)
  assert.match(attached.data.message, /核对和确认/)
  await memoryDB.confirmArtifact(own.userId, own.caseId, artifact.id, artifact.metadata!.fields)
  const confirmed = await request('post', { caseId: own.caseId, artifactIds: [artifact.id, artifact.id] }, {}, own.userId)
  assert.equal(confirmed.data.agentState.collectedFacts.length, 1)
  assert.equal(confirmed.data.agentState.collectedFacts[0].materialId, artifact.id)
  assert.equal(confirmed.data.agentState.collectedFacts[0].confirmed, true)
  await request('post', { caseId: own.caseId, artifactIds: [artifact.id] }, {}, own.userId)
  assert.equal((await memoryDB.findCaseById(own.userId, own.caseId))?.materialCount, 1)
  const history = await request('get', {}, { caseId: own.caseId }, own.userId)
  assert.deepEqual(history.data.messages[0].metadata.artifactIds, [artifact.id])
})
