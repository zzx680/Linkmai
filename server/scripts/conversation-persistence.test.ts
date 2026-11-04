import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { memoryDB } from '../src/db/memory'
import { conversationHash, conversationMaterialHash, type ConversationCommit } from '../src/db/conversation'

async function fixture() {
  const user = await memoryDB.createUser(`conversation-commit-${Math.random()}`)
  const caseData = await memoryDB.createCase(user.id, 'Atomic turn')
  const snapshot = await memoryDB.readConversationSnapshot(user.id, caseData.id)
  const input: ConversationCommit = { userId: user.id, caseId: caseData.id, requestId: 'request-1', requestHash: 'hash-1', text: '确认', expected: snapshot, assistantText: '记录完成',
    agentState: { ...snapshot.agentState, nextQuestion: '记录完成', collectedFacts: [{ key: 'accident_type', label: '事故类型', value: '交通事故', source: 'user_text', confidence: 'high', confirmed: true }] } }
  return { user, caseData, snapshot, input }
}

test('snapshot includes detached canonical facts, artifacts and bounded recent messages', async () => {
  const { user, caseData, snapshot } = await fixture()
  await memoryDB.persistConfirmedFacts(user.id, caseData.id, [{ key: 'test', label: '测试', value: '当前', source: 'user_text' }])
  const artifact = await memoryDB.createArtifact({ caseId: caseData.id, name: '材料', type: 'medical', ossUrl: '', ossKey: 'k', fileSize: 1, status: 'processed', metadata: { rawText: '未确认' } })
  for (let i = 0; i < 25; i++) await memoryDB.createMessage(snapshot.conversationId, 'user', 'text', String(i))
  const next = await memoryDB.readConversationSnapshot(user.id, caseData.id)
  assert.equal(next.facts[0].value, '当前')
  assert.equal(next.artifacts[0].id, artifact.id)
  assert.equal(next.recentMessages.length, 20)
  assert.equal(next.messageCount, 25)
  next.facts[0].value = '改动副本'
  next.artifacts[0].metadata!.rawText = '改动副本'
  assert.equal((await memoryDB.getCaseFacts(caseData.id))[0].value, '当前')
  assert.equal((await memoryDB.getArtifactsByCase(caseData.id))[0].metadata?.rawText, '未确认')
})

test('commit persists pair, confirmed facts and revision once; exact replay precedes stale check', async () => {
  const { user, caseData, snapshot, input } = await fixture()
  const [first, second] = await Promise.all([memoryDB.commitConversationTurn(input), memoryDB.commitConversationTurn(input)])
  assert.deepEqual(first, second)
  assert.equal((await memoryDB.getMessages(snapshot.conversationId)).length, 2)
  assert.equal((await memoryDB.findCaseById(user.id, caseData.id))?.inputRevision, 1)
  assert.equal((await memoryDB.getCaseRevisions(caseData.id)).length, 1)
  assert.deepEqual(await memoryDB.findConversationTurnResult(user.id, caseData.id, input.requestId, input.requestHash), first)
  await assert.rejects(memoryDB.commitConversationTurn({ ...input, requestHash: 'different' }), /REQUEST_ID_CONFLICT/)
  await assert.rejects(memoryDB.findConversationTurnResult(user.id, caseData.id, input.requestId, 'different'), /REQUEST_ID_CONFLICT/)
})

test('two different requests from the same snapshot have exactly one successful commit', async () => {
  const { input, snapshot, caseData } = await fixture()
  const results = await Promise.allSettled([memoryDB.commitConversationTurn(input), memoryDB.commitConversationTurn({ ...input, requestId: 'request-2' })])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.match((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.message, /CONVERSATION_STALE/)
  assert.equal((await memoryDB.getMessages(snapshot.conversationId)).length, 2)
  assert.equal((await memoryDB.getCaseRevisions(caseData.id)).length, 1)
})

test('revision, state, messages and material changes reject stale inference without writes', async () => {
  for (const change of ['revision', 'state', 'message', 'material']) {
    const { user, caseData, snapshot, input } = await fixture()
    if (change === 'revision') await memoryDB.persistConfirmedFacts(user.id, caseData.id, [{ key: 'changed', label: '更改', value: '是', source: 'user_text' }])
    if (change === 'state') await memoryDB.updateConversationState(snapshot.conversationId, { ...snapshot.agentState, nextQuestion: 'changed' })
    if (change === 'message') await memoryDB.createMessage(snapshot.conversationId, 'user', 'text', 'changed')
    if (change === 'material') await memoryDB.createArtifact({ caseId: caseData.id, name: '新材料', type: 'medical', ossUrl: '', ossKey: 'k', fileSize: 1, status: 'uploaded' })
    const before = await memoryDB.readConversationSnapshot(user.id, caseData.id)
    await assert.rejects(memoryDB.commitConversationTurn(input), /CONVERSATION_STALE/)
    const after = await memoryDB.readConversationSnapshot(user.id, caseData.id)
    assert.deepEqual(after, before)
  }
})

test('memory failure rolls back messages, state, facts, case flags and revisions', async () => {
  const { user, caseData, input } = await fixture()
  const before = await memoryDB.readConversationSnapshot(user.id, caseData.id)
  const create = memoryDB.createMessage.bind(memoryDB)
  const stub = mock.method(memoryDB, 'createMessage', async (...args: Parameters<typeof create>) => {
    if (args[1] === 'assistant') throw new Error('INJECTED_FAILURE')
    return create(...args)
  })
  try { await assert.rejects(memoryDB.commitConversationTurn(input), /INJECTED_FAILURE/) } finally { stub.mock.restore() }
  assert.deepEqual(await memoryDB.readConversationSnapshot(user.id, caseData.id), before)
  assert.equal((await memoryDB.getCaseRevisions(caseData.id)).length, 0)
})

test('hash is stable across jsonb key ordering and includes all material metadata', () => {
  assert.equal(conversationHash({ a: 1, b: { c: 2, d: 3 } }), conversationHash({ b: { d: 3, c: 2 }, a: 1 }))
  assert.notEqual(conversationMaterialHash([{ id: 'a', type: 'x', status: 'uploaded', metadata: { error: 'old' } }]), conversationMaterialHash([{ id: 'a', type: 'x', status: 'uploaded', metadata: { error: 'new' } }]))
})
