import assert from 'node:assert/strict'
import { test, beforeEach, afterEach } from 'node:test'
import { canGenerateReport, generateNextQuestion, processUserMessage as runTurn, type AgentState } from '../src/services/agent'
import type { MessageInterpreter } from '../src/services/agent-language'
import { localMessageFacts, parseLanguageResult } from '../src/services/agent-language'

const testInterpreter: MessageInterpreter = async () => ({ facts: [], reply: '已收到，请继续介绍案件情况。', status: 'model' })
async function processUserMessage(...args: Parameters<typeof runTurn>): Promise<AgentState> {
  return (await runTurn(args[0], args[1], args[2], args[3], args[4] || testInterpreter, args[5])).agentState
}
import axios from 'axios'
import { mock } from 'node:test'
import { config } from '../src/config'

let provider: ReturnType<typeof mock.method>
beforeEach(() => {
  provider = mock.method(axios, 'post', async () => { throw new Error('offline test provider') })
})
afterEach(() => { provider.mock.restore() })

function empty(): AgentState { return { stage: 'collecting', collectedFacts: [] } }
async function complete() {
  let state = empty()
  for (const text of ['traffic_accident', '2026年10月1日', '中山路口', '甲方王某，乙方李某', '等红灯时被后车追尾']) state = await processUserMessage(state, text)
  return state
}

test('collect all five fields in order and keep inferred narrative pending confirmation', async () => {
  const initial = empty()
  const first = await processUserMessage(initial, 'traffic_accident')
  assert.deepEqual(initial, empty())
  assert.equal(first.collectedFacts[0].value, 'traffic_accident')
  const state = await complete()
  assert.equal(state.collectedFacts.length, 5)
  assert.equal(state.collectedFacts[3].key, 'parties_involved')
  assert.equal(state.collectedFacts[4].key, 'accident_description')
  assert.equal(state.stage, 'confirming')
  assert.equal(canGenerateReport(state), false)
  const finished = await processUserMessage(state, 'no_more_materials')
  assert.equal(finished.stage, 'confirming')
  assert.equal(state.stage, 'confirming')
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
  assert.equal((await processUserMessage(state, '', [], 'finish')).stage, 'confirming')
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

test('a dictated narrative collects multiple facts and delegates the response to the model', async () => {
  const original = empty()
  const response = '先确保安全并及时就医，有紧急情况拨打 120。'
  const next = await processUserMessage(original, dictated, [], undefined, async () => ({ facts: [], reply: response }))
  assert.deepEqual(original, empty())
  const facts = Object.fromEntries(next.collectedFacts.map(fact => [fact.key, fact.value]))
  assert.equal(facts.accident_type, 'traffic_accident')
  assert.equal(facts.accident_date, '今天')
  assert.match(facts.parties_involved, /右转的汽车/)
  assert.equal(facts.accident_description, dictated)
  assert.equal(facts.accident_location, undefined)
  assert.equal(facts.liability, undefined)
  assert.equal(next.nextQuestion, response)
  assert.equal(next.stage, 'confirming')
  assert.equal(canGenerateReport(next), false)
  const confirmed = await processUserMessage(next, '', [], 'confirm')
  assert.equal(confirmed.stage, 'collecting')
})

test('acknowledgements and questions never become dates or advance past an unanswered field', async () => {
  const first = await processUserMessage(empty(), '交通事故')
  for (const text of ['好', '嗯', '不知道', '可以', '我现在该怎么办？', '今天吗']) {
    const result = await processUserMessage(first, text)
    assert.equal(result.collectedFacts.length, 1, text)
    assert.equal(result.nextQuestion, '已收到，请继续介绍案件情况。')
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

test('real interpreter requires a bounded model response and rejects provider failure', async () => {
  const previous = config.deepseek.apiKey
  config.deepseek.apiKey = 'unit-test-only'
  let fail = false
  const stub = mock.method(axios, 'post', async (url, body: any, options: any) => {
    assert.match(url, /\/chat\/completions$/)
    assert.ok(options.timeout <= 6500)
    assert.match(body.messages[0].content, /不能声称已生成/)
    assert.equal(JSON.parse(body.messages[1].content).message, dictated)
    if (fail) throw new Error('provider unavailable')
    return { data: { choices: [{ message: { content: JSON.stringify({ facts: [], reply: '先确保安全' }) } }] } }
  })
  try {
    const next = await runTurn(empty(), dictated)
    assert.equal(next.agentState.collectedFacts.find(fact => fact.key === 'accident_date')?.value, '今天')
    assert.equal(next.assistantText, '先确保安全')
    assert.equal(next.agentState.nextQuestion, next.assistantText)
    fail = true
    await assert.rejects(runTurn(empty(), dictated), /MODEL_UNAVAILABLE/)
    assert.equal(stub.mock.callCount(), 2)
  } finally {
    stub.mock.restore()
    config.deepseek.apiKey = previous
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
  assert.equal(calls, 4)
  const parsed = parseLanguageResult(JSON.stringify({ facts: [
    { key: 'accident_date', value: '昨天', evidence: '今天' },
    { key: 'liability', value: '对方全责', evidence: '对方全责' },
    { key: 'accident_date', value: '今天', evidence: '今天' },
  ], reply: '已了解' }), dictated)
  assert.deepEqual(parsed.facts.map(fact => fact.value), ['今天'])
  assert.throws(() => parseLanguageResult('{"facts":[{"key":"payment_status","value":"paid","evidence":"今天"}],"reply":"已了解"}', dictated))
  assert.throws(() => parseLanguageResult('{"facts":[],"reply":""}', dictated))
  assert.deepEqual(localMessageFacts('如果今天骑车被汽车撞了该怎么办'), [])
})

test('greetings invoke the model without collecting facts or changing readiness', async () => {
  for (const initial of [empty(), { stage: 'ready', collectedFacts: [
    ['accident_type', 'traffic_accident'], ['accident_date', '2026-10-01'], ['accident_location', '中山路口'],
    ['parties_involved', '双方车辆'], ['accident_description', '后车追尾'], ['liability_status', '尚未认定'],
    ['injury_status', '无人受伤'], ['property_loss', '待报价'], ['user_goal', '准备协商'],
  ].map(([key, value]) => ({ key, value, label: key, source: 'user_text', confidence: 'high', confirmed: true })) } as AgentState]) {
    let state = initial
    const replies: string[] = []
    let calls = 0
    const interpret: MessageInterpreter = async () => ({ facts: [], reply: `第${++calls}次问候` })
    for (const greeting of ['你好', 'hi', '你好']) {
      state = await processUserMessage(state, greeting, [], undefined, interpret)
      replies.push(state.nextQuestion!)
      assert.deepEqual(state.collectedFacts, initial.collectedFacts)
      assert.equal(state.stage, initial.stage)
    }
    assert.equal(calls, 3)
    assert.equal(new Set(replies).size, 3)
  }
})


test('questions about documents do not promise unavailable generation or turn into accident facts', async () => {
  let calls = 0
  const response = '请在报告页面查看生成条件，暂不支持生成诉状或导出 PDF。'
  const next = await processUserMessage(empty(), '现在可以生成诉状和赔偿报告吗？', [], undefined, async () => {
    calls++
    return { facts: [], reply: response }
  })
  assert.equal(calls, 1)
  assert.equal(next.nextQuestion, response)
  assert.equal(next.collectedFacts.length, 0)
})

test('model-only facts remain pending even for a single missing field', async () => {
  const first = await complete()
  const result = await runTurn(first, '我希望协商，怎么办？', [], undefined, async () => ({
    facts: [{ key: 'user_goal', value: '协商', evidence: '协商' }], reply: '这项信息还需要核对。',
  }))
  assert.equal(result.agentState.collectedFacts.find(fact => fact.key === 'user_goal')?.confirmed, false)
  assert.equal(result.agentState.stage, 'confirming')
  assert.equal(result.assistantText, result.agentState.nextQuestion)
  assert.ok(result.agentState.quickReplies?.some(reply => reply.action === 'confirm'))
})

test('targeted and prefixed edits wait for confirmation and block all extra model facts', async () => {
  const initial = await complete()
  for (const prefixed of [false, true]) {
    const state = prefixed ? initial : { ...initial, editingFactKey: 'accident_date' }
    const before = structuredClone(state)
    const text = `${prefixed ? '事故日期：' : ''}2026年10月2日，在人民路口`
    let calls = 0
    const result = await runTurn(state, text, [], undefined, async (_state, _text, context) => {
      calls++
      assert.equal(context?.editTarget, 'accident_date')
      return { facts: [{ key: 'accident_location', value: '人民路口', evidence: '人民路口' }], reply: '请核对修改后的日期。' }
    })
    assert.equal(calls, 1)
    assert.deepEqual(state, before)
    assert.equal(result.agentState.collectedFacts.find(fact => fact.key === 'accident_date')?.confirmed, false)
    assert.equal(result.agentState.collectedFacts.find(fact => fact.key === 'accident_location')?.value, '中山路口')
    assert.equal(result.agentState.editingFactKey, undefined)
  }
})

test('every new turn uses exactly one model reply including actions and material-only events', async () => {
  const events = [
    { text: '你好' }, { text: '好' }, { text: '请问接下来怎么办？' }, { text: dictated },
    ...['confirm', 'confirm:correct', 'edit', 'confirm:edit', 'edit:injury_status', 'finish', 'no_more_materials', 'generate_report', 'upload', 'manual_input'].map(action => ({ text: '', action })),
    { text: '', materials: [{ type: 'medical_record', artifactId: 'a1', confirmed: false }] },
  ]
  for (const event of events) {
    let calls = 0
    const result = await runTurn(empty(), event.text, 'materials' in event ? event.materials : [], 'action' in event ? event.action : undefined,
      async () => ({ facts: [], reply: `模型回复${++calls}` }))
    assert.equal(calls, 1)
    assert.equal(result.assistantText, '模型回复1')
    assert.equal(result.agentState.nextQuestion, result.assistantText)
  }
})

test('invalid edits keep their target and failed or empty model replies leave input untouched', async () => {
  const state = { ...await complete(), editingFactKey: 'accident_date' }
  const before = structuredClone(state)
  const result = await runTurn(state, '好', [], undefined, async () => ({
    facts: [{ key: 'accident_date', value: '今天', evidence: '今天' }], reply: '请提供日期。',
  }))
  assert.equal(result.agentState.editingFactKey, 'accident_date')
  for (const interpret of [async () => { throw new Error('MODEL_UNAVAILABLE') }, async () => ({ facts: [], reply: ' ' })]) {
    await assert.rejects(runTurn(state, '2026年10月2日', [], undefined, interpret), /MODEL_UNAVAILABLE/)
    assert.deepEqual(state, before)
  }
})

test('new readiness fields parse as proposals', () => {
  for (const [key, value] of [['liability_status', '尚未认定'], ['injury_status', '无人受伤'], ['user_goal', '准备协商']]) {
    const parsed = parseLanguageResult(JSON.stringify({ facts: [{ key, value, evidence: value }], reply: '请核对。' }), value)
    assert.equal(parsed.facts[0]?.key, key)
  }
})
