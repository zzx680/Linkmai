import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canGenerateReport, generateNextQuestion, processUserMessage, type AgentState } from '../src/services/agent'

function empty(): AgentState { return { stage: 'collecting', collectedFacts: [] } }
async function complete() {
  let state = empty()
  for (const text of ['traffic_accident', '2026年10月1日', '中山路口', '甲方王某，乙方李某', '等红灯时被后车追尾']) state = await processUserMessage(state, text)
  return state
}

test('collect all five fields in order and finish without model calls', async () => {
  const initial = empty()
  const first = await processUserMessage(initial, 'traffic_accident')
  assert.deepEqual(initial, empty())
  assert.equal(first.collectedFacts[0].value, 'traffic_accident')
  const state = await complete()
  assert.equal(state.collectedFacts.length, 5)
  assert.equal(state.collectedFacts[3].key, 'parties_involved')
  assert.equal(state.collectedFacts[4].key, 'accident_description')
  assert.equal(state.stage, 'collecting')
  assert.equal(canGenerateReport(state), true)
  const finished = await processUserMessage(state, 'no_more_materials')
  assert.equal(finished.stage, 'ready')
  assert.equal(state.stage, 'collecting')
  for (const reply of finished.quickReplies || []) assert.equal(reply.value, reply.action)
})

test('every accident type quick reply is handled and controls are not collected as facts', async () => {
  for (const type of ['traffic_accident', 'work_injury', 'personal_injury']) {
    assert.equal((await processUserMessage(empty(), type)).collectedFacts[0].value, type)
  }
  let state = empty()
  for (const control of ['finish', 'no_more_materials', 'generate_report', 'upload', 'manual_input']) {
    state = await processUserMessage(state, control)
    assert.equal(state.collectedFacts.length, 0)
    assert.equal(state.stage, 'collecting')
  }
  for (const reply of generateNextQuestion(await complete()).quickReplies || []) assert.equal(reply.action, reply.value)
})

test('material confirmation and targeted edits are immutable and upsert facts', async () => {
  const original = await complete()
  let state = await processUserMessage(original, '', [{ type: 'accident_report', artifactId: 'artifact-1', extractedData: { accident_date: '错误日期' } }])
  assert.equal(state.stage, 'confirming')
  assert.equal(state.pendingConfirmation?.[0].materialId, 'artifact-1')
  assert.equal(canGenerateReport(state), false)
  assert.equal((await processUserMessage(state, 'finish')).stage, 'confirming')
  state = await processUserMessage(state, 'confirm:edit')
  assert.ok(state.quickReplies?.some(reply => reply.action === 'edit:accident_date'))
  state = await processUserMessage(state, '', [], 'edit:accident_date')
  assert.equal(state.editingFactKey, 'accident_date')
  state = await processUserMessage(state, '2026年10月2日')
  assert.equal(state.collectedFacts.length, 5)
  assert.equal(state.collectedFacts.find(fact => fact.key === 'accident_date')?.value, '2026年10月2日')
  assert.equal(original.collectedFacts.find(fact => fact.key === 'accident_date')?.value, '2026年10月1日')
  state = await processUserMessage(state, '事故经过：双方车辆侧面碰撞')
  assert.equal(state.collectedFacts.find(fact => fact.key === 'accident_description')?.value, '双方车辆侧面碰撞')
  assert.equal((await processUserMessage(state, '', [], 'finish')).stage, 'ready')
})

test('confirm resumes collection and already-confirmed material preserves provenance', async () => {
  const pending = await processUserMessage(empty(), '', [{ type: 'accident_report', artifactId: 'a1', extractedData: { accident_date: '2026-10-01' } }])
  const confirmed = await processUserMessage(pending, 'confirm:correct')
  assert.equal(confirmed.stage, 'collecting')
  assert.equal(confirmed.collectedFacts[0].confirmed, true)
  assert.equal(pending.collectedFacts[0].confirmed, false)
  const state = await processUserMessage(confirmed, '', [{ type: 'accident_report', artifactId: 'a1', confirmed: true, extractedData: { accident_date: '2026-10-02' } }])
  assert.equal(state.collectedFacts.length, 1)
  assert.equal(state.collectedFacts[0].materialId, 'a1')
})
