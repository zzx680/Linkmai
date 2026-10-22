import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canGenerateReport, generateNextQuestion, processUserMessage, type AgentState } from '../src/services/agent'
import { localMessageFacts, parseLanguageResult } from '../src/services/agent-language'
import axios from 'axios'
import { mock } from 'node:test'
import { config } from '../src/config'

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

const dictated = '嗯，我今天骑电动车出门，然后过红绿灯的时候被一个右转的汽车撞了，然后我摔倒了，特别痛。但现在还没有验伤。我现在应该干嘛'

test('a dictated narrative collects multiple facts and responds to injury before asking missing details', async () => {
  const original = empty()
  const next = await processUserMessage(original, dictated)
  assert.deepEqual(original, empty())
  const facts = Object.fromEntries(next.collectedFacts.map(fact => [fact.key, fact.value]))
  assert.equal(facts.accident_type, 'traffic_accident')
  assert.equal(facts.accident_date, '今天')
  assert.match(facts.parties_involved, /右转的汽车/)
  assert.equal(facts.accident_description, dictated)
  assert.equal(facts.accident_location, undefined)
  assert.equal(facts.liability, undefined)
  assert.match(next.nextQuestion!, /尽快就医|就医检查/)
  assert.match(next.nextQuestion!, /120/)
  assert.doesNotMatch(next.nextQuestion!, /什么类型|发生在什么时间/)
  assert.doesNotMatch(next.nextQuestion!, /traffic_accident/)
  assert.equal(next.stage, 'confirming')
  assert.equal(canGenerateReport(next), false)
  const confirmed = await processUserMessage(next, '', [], 'confirm')
  assert.match(confirmed.nextQuestion!, /具体地点/)
  assert.doesNotMatch(confirmed.nextQuestion!, /什么类型|发生在什么时间/)
})

test('acknowledgements and questions never become dates or advance past an unanswered field', async () => {
  const first = await processUserMessage(empty(), '交通事故')
  for (const text of ['好', '嗯', '不知道', '可以', '我现在该怎么办？', '今天吗']) {
    const result = await processUserMessage(first, text)
    assert.equal(result.collectedFacts.length, 1, text)
    assert.match(result.nextQuestion!, /发生在什么时间/)
    assert.equal(canGenerateReport(result), false)
  }
  const legacy: AgentState = { ...first, collectedFacts: [...first.collectedFacts, { key: 'accident_date', label: '事故日期', value: '好', source: 'user_text', confidence: 'high', confirmed: true }] }
  const repaired = await processUserMessage(legacy, '嗯')
  assert.equal(repaired.collectedFacts.some(fact => fact.key === 'accident_date'), false)
  assert.equal(legacy.collectedFacts.length, 2)
  const historicDate: AgentState = { ...legacy, collectedFacts: legacy.collectedFacts.map(fact => fact.key === 'accident_date' ? { ...fact, value: '国庆假期' } : fact) }
  const preserved = await processUserMessage(historicDate, '嗯')
  assert.equal(preserved.collectedFacts.find(fact => fact.key === 'accident_date')?.value, '国庆假期')
})

test('real interpreter wiring uses a bounded model request and degrades to local intake on provider failure', async () => {
  const previous = { nodeEnv: config.nodeEnv, apiKey: config.deepseek.apiKey }
  config.nodeEnv = 'production'
  config.deepseek.apiKey = 'unit-test-only'
  let fail = false
  const stub = mock.method(axios, 'post', async (url, body: any, options: any) => {
    assert.match(url, /\/chat\/completions$/)
    assert.ok(options.timeout <= 6500)
    assert.match(body.messages[0].content, /不能声称可生成诉状/)
    assert.equal(JSON.parse(body.messages[1].content).message, dictated)
    if (fail) throw new Error('provider unavailable')
    return { data: { choices: [{ message: { content: JSON.stringify({ facts: [], reply: '先确保安全' }) } }] } }
  })
  try {
    const next = await processUserMessage(empty(), dictated)
    assert.equal(next.collectedFacts.find(fact => fact.key === 'accident_date')?.value, '今天')
    assert.match(next.nextQuestion!, /就医/)
    fail = true
    const fallback = await processUserMessage(empty(), dictated)
    assert.equal(fallback.collectedFacts.find(fact => fact.key === 'accident_type')?.value, 'traffic_accident')
    assert.match(fallback.nextQuestion!, /就医/)
    assert.equal(stub.mock.callCount(), 2)
  } finally {
    stub.mock.restore()
    config.nodeEnv = previous.nodeEnv
    config.deepseek.apiKey = previous.apiKey
  }
})

test('contextual interpretation uses quoted evidence, keeps control actions local and never fabricates fields', async () => {
  let calls = 0
  const interpret = async () => {
    calls++
    return { facts: [
      { key: 'accident_location' as const, value: '中山路口', evidence: '中山路口' },
      { key: 'accident_date' as const, value: '2026-01-01', evidence: '今天' },
    ], reply: '先保留相关现场资料' }
  }
  const result = await processUserMessage(empty(), '今天骑车在中山路口被一辆汽车撞倒', [], undefined, interpret)
  assert.equal(result.collectedFacts.find(fact => fact.key === 'accident_location')?.value, '中山路口')
  assert.equal(result.collectedFacts.some(fact => fact.value === '2026-01-01'), false)
  await processUserMessage(result, '', [], 'confirm', interpret)
  await processUserMessage(result, '', [], 'finish', interpret)
  await processUserMessage(result, '好', [], undefined, interpret)
  assert.equal(calls, 1)
  const parsed = parseLanguageResult(JSON.stringify({ facts: [
    { key: 'accident_date', value: '昨天', evidence: '今天' },
    { key: 'liability', value: '对方全责', evidence: '对方全责' },
    { key: 'accident_date', value: '今天', evidence: '今天' },
  ], reply: '' }), dictated)
  assert.deepEqual(parsed.facts.map(fact => fact.value), ['今天'])
  assert.throws(() => parseLanguageResult('{"facts":[{"key":"payment_status","value":"paid","evidence":"今天"}],"reply":""}', dictated))
  assert.deepEqual(localMessageFacts('如果今天骑车被汽车撞了该怎么办'), [])
})

test('questions about documents do not promise unavailable generation or turn into accident facts', async () => {
  const next = await processUserMessage(empty(), '现在可以生成诉状和赔偿报告吗？')
  assert.match(next.nextQuestion!, /暂不支持生成诉状|暂不支持.*PDF/)
  assert.equal(next.collectedFacts.length, 0)
})
