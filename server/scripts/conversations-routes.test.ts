import assert from 'node:assert/strict'
import { test, beforeEach, afterEach, mock } from 'node:test'
import axios from 'axios'
import { config } from '../src/config'
import { caseAgentFactKeys } from '../src/harness/case-agent'
import express from 'express'
import { memoryDB } from '../src/db/memory'
import router from '../src/routes/conversations'
import { db } from '../src/db'

let provider: ReturnType<typeof mock.method>
let originalKey: string
let originalHarness: string | undefined
beforeEach(() => {
  originalKey = config.deepseek.apiKey
  originalHarness = process.env.HARNESS_ENABLED
  config.deepseek.apiKey = 'offline-route-test'
  process.env.HARNESS_ENABLED = 'false'
  let calls = 0
  provider = mock.method(axios, 'post', async () => ({ data: { choices: [{ message: {
    content: JSON.stringify({ facts: [], reply: `模型回复${++calls}：材料请先在材料页核对和确认。` }),
  } }] } }))
})
afterEach(() => {
  provider.mock.restore()
  config.deepseek.apiKey = originalKey
  if (originalHarness === undefined) delete process.env.HARNESS_ENABLED
  else process.env.HARNESS_ENABLED = originalHarness
})

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
  assert.equal(sent.data.agentState.stage, 'collecting')
  const history = await request('get', {}, { caseId: own.caseId }, own.userId)
  assert.deepEqual(history.data.agentState, sent.data.agentState)
  assert.equal(history.data.conversationState, 'collecting')
  assert.equal(history.data.readiness.canGenerate, false)
  assert.equal(history.data.messages.length, 12)
  const secondCase = await memoryDB.createCase(own.userId, '第二案件')
  assert.deepEqual((await request('get', {}, { caseId: secondCase.id }, own.userId)).data.messages, [])
  assert.equal((await request('get', {}, { caseId: own.caseId }, own.userId)).data.messages.length, 12)
})

test('consecutive greetings return distinct saved replies without adding accident facts', async () => {
  const own = await fixture()
  const replies: string[] = []
  for (const text of ['你好', 'hi', '你好']) {
    const result = await request('post', { caseId: own.caseId, text }, {}, own.userId)
    assert.equal(result.status, 200)
    assert.equal(result.data.agentState.collectedFacts.length, 0)
    replies.push(result.data.message)
  }
  assert.equal(new Set(replies).size, 3)
  const history = await request('get', {}, { caseId: own.caseId }, own.userId)
  assert.equal(history.data.messages.length, 6)
  assert.deepEqual(history.data.messages.filter((message: any) => message.role === 'assistant').map((message: any) => message.text), replies)
})


test('concurrent snapshots commit one complete turn and reject the stale turn', async () => {
  const own = await fixture()
  const results = await Promise.all([
    request('post', { caseId: own.caseId, text: 'traffic_accident' }, {}, own.userId),
    request('post', { caseId: own.caseId, text: '2026年10月1日' }, {}, own.userId),
  ])
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
  assert.equal(results.find(result => result.status === 409).code, 'CONVERSATION_STALE')
  const history = await request('get', {}, { caseId: own.caseId }, own.userId)
  assert.equal(history.data.messages.length, 2)
  assert.deepEqual(history.data.messages.map((message: any) => message.role), ['user', 'assistant'])
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

test('completed request replay preserves its original response without committing again', async () => {
  const own = await fixture()
  const persistence = db as typeof db & Record<string, any>
  const originalFind = persistence.findConversationTurnResult
  const originalSnapshot = persistence.readConversationSnapshot
  const originalCommit = persistence.commitConversationTurn
  const originalState = { stage: 'collecting', collectedFacts: [], nextQuestion: '原始回复', quickReplies: [] }
  let commits = 0
  persistence.findConversationTurnResult = async () => ({ agentState: originalState, assistantText: '原始回复', quickReplies: [] })
  persistence.readConversationSnapshot = async () => ({
    conversationId: 'conversation-replay', inputRevision: 0, caseData: await memoryDB.findCaseById(own.userId, own.caseId),
    agentState: { ...originalState, collectedFacts: [{ key: 'accident_location', label: '事故地点', value: '新地点', confirmed: false, source: 'user_text', confidence: 'high' }] }, artifacts: [], recentMessages: [],
  })
  persistence.commitConversationTurn = async () => { commits++; throw new Error('REPLAY_MUST_NOT_COMMIT') }
  try {
    const result = await request('post', { caseId: own.caseId, text: '你好', requestId: 'repeat-1' }, {}, own.userId)
    assert.equal(result.status, 200)
    assert.equal(result.data.message, '原始回复')
    assert.deepEqual(result.data.agentState, originalState)
    assert.equal(commits, 0)
    assert.equal(provider.mock.callCount(), 0)
    assert.equal(result.data.readiness.pending, 1)
  } finally {
    persistence.findConversationTurnResult = originalFind
    persistence.readConversationSnapshot = originalSnapshot
    persistence.commitConversationTurn = originalCommit
  }
})

test('request conflicts and stale turns return safe conflict codes', async () => {
  const own = await fixture()
  const persistence = db as typeof db & Record<string, any>
  const originalFind = persistence.findConversationTurnResult
  try {
    for (const code of ['REQUEST_ID_CONFLICT', 'CONVERSATION_STALE']) {
      persistence.findConversationTurnResult = async () => { throw new Error(code) }
      const result = await request('post', { caseId: own.caseId, text: '你好', requestId: 'conflict-1' }, {}, own.userId)
      assert.equal(result.status, 409)
      assert.equal(result.code, code)
    }
  } finally {
    persistence.findConversationTurnResult = originalFind
  }
})

test('all registered fact edit actions are accepted and invalid fields fail before the model', async () => {
  const own = await fixture()
  for (const key of caseAgentFactKeys) {
    const result = await request('post', { caseId: own.caseId, action: `edit:${key}` }, {}, own.userId)
    assert.equal(result.status, 200, key)
    assert.equal(result.data.agentState.editingFactKey, key)
  }
  const calls = provider.mock.callCount()
  assert.equal((await request('post', { caseId: own.caseId, action: 'edit:payment_status' }, {}, own.userId)).status, 400)
  assert.equal(provider.mock.callCount(), calls)
})

test('model failures return 503 without committing a turn, facts or revision; same request can retry', async () => {
  const own = await fixture()
  const persistence = db as typeof db & Record<string, any>
  const before = await persistence.readConversationSnapshot(own.userId, own.caseId)
  const revisions = await memoryDB.getCaseRevisions(own.caseId)
  const commit = mock.method(persistence, 'commitConversationTurn')
  const bodies = ['not json', JSON.stringify({ facts: [], reply: '' }), JSON.stringify({ facts: [{ key: 'payment_status', value: 'paid', evidence: 'paid' }], reply: '回复' })]
  try {
    for (const mode of ['missing-key', 'timeout', ...bodies]) {
      config.deepseek.apiKey = mode === 'missing-key' ? '' : 'offline-route-test'
      provider.mock.mockImplementation(async () => {
        if (mode === 'timeout') throw new Error('ETIMEDOUT')
        return { data: { choices: [{ message: { content: mode } }] } }
      })
      const result = await request('post', { caseId: own.caseId, text: '交通事故', requestId: 'retry-failure' }, {}, own.userId)
      assert.equal(result.status, 503, mode)
      assert.equal(result.code, 'MODEL_UNAVAILABLE')
      assert.equal(commit.mock.callCount(), 0)
      assert.deepEqual(await persistence.readConversationSnapshot(own.userId, own.caseId), before)
      assert.deepEqual(await memoryDB.getCaseRevisions(own.caseId), revisions)
    }
    config.deepseek.apiKey = 'offline-route-test'
    provider.mock.mockImplementation(async () => ({ data: { choices: [{ message: { content: JSON.stringify({ facts: [], reply: '恢复后的模型回复' }) } }] } }))
    const recovered = await request('post', { caseId: own.caseId, text: '交通事故', requestId: 'retry-failure' }, {}, own.userId)
    assert.equal(recovered.status, 200)
    assert.equal(recovered.data.message, '恢复后的模型回复')
    assert.equal(recovered.data.agentState.nextQuestion, recovered.data.message)
    assert.equal(commit.mock.callCount(), 1)
    const calls = provider.mock.callCount()
    const replay = await request('post', { caseId: own.caseId, text: '交通事故', requestId: 'retry-failure' }, {}, own.userId)
    assert.equal(replay.data.message, recovered.data.message)
    assert.equal(provider.mock.callCount(), calls)
    assert.equal(commit.mock.callCount(), 1)
    const history = await request('get', {}, { caseId: own.caseId }, own.userId)
    assert.equal(history.data.messages.length, 2)
    assert.equal(history.data.messages[1].text, recovered.data.message)
  } finally { commit.mock.restore() }
})

test('model claims cannot generate reports, grant payment or confirm materials', async () => {
  const own = await fixture()
  const before = await memoryDB.findCaseById(own.userId, own.caseId)
  provider.mock.mockImplementation(async () => ({ data: { choices: [{ message: { content: JSON.stringify({ facts: [], reply: '已生成、已付费、已确认材料' }) } }] } }))
  const result = await request('post', { caseId: own.caseId, text: '帮我生成报告' }, {}, own.userId)
  assert.equal(result.status, 200)
  assert.equal(result.data.readiness.canGenerate, false)
  assert.deepEqual(await memoryDB.findCaseById(own.userId, own.caseId), before)
  assert.equal(await memoryDB.getReportByCase(own.caseId), null)
})
