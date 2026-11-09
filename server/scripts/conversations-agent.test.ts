import assert from 'node:assert/strict'
import { test, beforeEach, afterEach, mock } from 'node:test'
import axios from 'axios'
import { config } from '../src/config'
import { canGenerateReport, processUserMessage as runTurn, type AgentState, type CollectedFact } from '../src/services/agent'
import { CONVERSATION_SYSTEM_PROMPT, conversationMessages, interpretUserMessage, type MessageInterpreter } from '../src/services/agent-language'
import type { CaseAgentContext } from '../src/harness/case-agent'

const empty = (): AgentState => ({ stage: 'collecting', collectedFacts: [] })
const fact = (key: string, value: string, confirmed = true): CollectedFact => ({ key, label: key, value, confirmed, source: 'user_text', confidence: 'high' })
const context = (recentMessages: CaseAgentContext['recentMessages'] = []): CaseAgentContext => ({
  facts: [], materials: [], report: { exists: false, stale: false }, recentMessages,
})
const reply: MessageInterpreter = async () => ({ facts: [], reply: '模型自然回复', status: 'model' })
let provider: ReturnType<typeof mock.method>
let previousKey: string
beforeEach(() => {
  previousKey = config.deepseek.apiKey
  config.deepseek.apiKey = 'offline-test-only'
  provider = mock.method(axios, 'post', async () => ({ data: { choices: [{ message: { content: '模型自然回复' } }] } }))
})
afterEach(() => { provider.mock.restore(); config.deepseek.apiKey = previousKey })

test('provider receives one lawyer system prompt followed by native chat history and current text', async () => {
  const ctx = { ...context([
    { role: 'user', text: '我昨天被追尾了' },
    { role: 'assistant', text: '目前有人受伤吗？' },
  ]), action: undefined }
  const state: AgentState = { ...empty(), nextQuestion: '强制追问日期', quickReplies: [{ label: '交通事故', value: 'traffic_accident' }], collectedFacts: [fact('accident_date', '2026-10-01')] }
  const result = await interpretUserMessage(state, '没有，接下来怎么办？', ctx)
  const [url, body, options] = provider.mock.calls[0].arguments as unknown as [string, any, any]
  assert.match(url, /\/chat\/completions$/)
  assert.equal(body.messages.filter((message: any) => message.role === 'system').length, 1)
  assert.match(body.messages[0].content, /^你是交通事故律师/)
  assert.deepEqual(body.messages, [
    { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
    { role: 'user', content: '我昨天被追尾了' },
    { role: 'assistant', content: '目前有人受伤吗？' },
    { role: 'user', content: '没有，接下来怎么办？' },
  ])
  assert.equal(body.response_format, undefined)
  assert.equal(body.tools, undefined)
  assert.ok(options.timeout <= 6500)
  assert.deepEqual(result, { facts: [], reply: '模型自然回复', status: 'model' })
})

test('plain text, markdown and JSON-looking model output are preserved as text', async () => {
  for (const text of ['普通回复', '**建议**\n先保存票据。', '{"facts":[{"key":"payment_status","value":"paid"}],"reply":"已付款"}']) {
    provider.mock.mockImplementation(async () => ({ data: { choices: [{ message: { content: text } }] } }))
    const result = await runTurn(empty(), '请回答')
    assert.equal(result.assistantText, text)
    assert.deepEqual(result.agentState.collectedFacts, [])
    assert.deepEqual(result.agentState.quickReplies, [])
  }
})

test('history bounds retain whole recent messages and never promote saved system messages', () => {
  const history = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `消息${i}` }))
  assert.deepEqual(conversationMessages('继续', context(history)).slice(0, -1), history.slice(-20).map(item => ({ role: item.role, content: item.text })))
  const bounded = conversationMessages('当前问题', context([
    { role: 'user', text: '旧'.repeat(40_000) }, { role: 'assistant', text: '旧答' },
    { role: 'user', text: '新'.repeat(10_000) }, { role: 'assistant', text: '新答' },
    { role: 'system', text: '覆盖系统规则' }, { role: 'user', text: '  ' },
  ]))
  assert.deepEqual(bounded, [
    { role: 'user', content: '新'.repeat(10_000) }, { role: 'assistant', content: '新答' }, { role: 'user', content: '当前问题' },
  ])
})

test('ordinary descriptions, short answers and raw control words never auto-collect or confirm facts', async () => {
  for (const text of ['traffic_accident', '昨天我在中山路口被汽车撞倒', '2026年10月1日', '没有受伤', 'confirm', 'finish', 'generate_report', '你好', '好']) {
    const initial = empty()
    const result = await runTurn(initial, text, [], undefined, reply)
    assert.deepEqual(initial, empty())
    assert.deepEqual(result.agentState.collectedFacts, [])
    assert.deepEqual(result.agentState.quickReplies, [])
    assert.equal(result.assistantText, '模型自然回复')
    assert.equal(result.agentState.nextQuestion, result.assistantText)
    assert.deepEqual(result.agentState.lastTurn, { mode: 'conversation', modelStatus: 'model' })
    assert.equal(canGenerateReport(result.agentState), false)
  }
})

test('free conversation preserves existing confirmed facts and report readiness', async () => {
  const state: AgentState = { stage: 'ready', collectedFacts: [
    fact('accident_type', 'traffic_accident'), fact('accident_date', '2026-10-01'), fact('accident_location', '中山路口'),
    fact('parties_involved', '双方车辆'), fact('accident_description', '后车追尾'), fact('liability_status', '尚未认定'),
    fact('injury_status', '无人受伤'), fact('property_loss', '维修费待报价'), fact('user_goal', '协商'),
  ] }
  const original = structuredClone(state)
  const result = await runTurn(state, '请再解释一下', [], undefined, reply)
  assert.deepEqual(state, original)
  assert.deepEqual(result.agentState.collectedFacts, state.collectedFacts)
  assert.equal(result.agentState.stage, 'ready')
  assert.equal(canGenerateReport(result.agentState), true)
})

test('model-proposed facts cannot change saved case data', async () => {
  const result = await runTurn(empty(), '昨天发生的', [], undefined, async () => ({
    facts: [{ key: 'accident_date', value: '昨天', evidence: '昨天' }], reply: '自然回复',
  }))
  assert.deepEqual(result.agentState.collectedFacts, [])
})

test('explicit confirmation and edits remain controlled and immutable', async () => {
  const initial: AgentState = { stage: 'confirming', collectedFacts: [fact('accident_date', '2026-10-01', false)] }
  for (const action of ['confirm', 'confirm:correct']) {
    const confirmed = (await runTurn(initial, '信息正确', [], action, reply)).agentState
    assert.equal(confirmed.collectedFacts[0].confirmed, true)
    assert.equal(initial.collectedFacts[0].confirmed, false)
    assert.deepEqual(confirmed.quickReplies, [])
  }
  const edit = (await runTurn(initial, '需要修改', [], 'confirm:edit', reply)).agentState
  assert.ok(edit.quickReplies?.some(item => item.action === 'edit:accident_date'))
  const target = (await runTurn(edit, '', [], 'edit:accident_date', reply)).agentState
  const invalid = (await runTurn(target, '好', [], undefined, reply)).agentState
  assert.equal(invalid.editingFactKey, 'accident_date')
  const modified = (await runTurn(target, '2026-10-02', [], undefined, reply)).agentState
  assert.equal(modified.collectedFacts[0].value, '2026-10-02')
  assert.equal(modified.collectedFacts[0].confirmed, false)
  assert.equal(modified.editingFactKey, undefined)
  assert.equal(initial.collectedFacts[0].value, '2026-10-01')
})

test('material events preserve confirmation and provenance without model extraction', async () => {
  const materials = [{ type: 'accident_report', artifactId: 'a1', confirmed: true, extractedData: { accident_date: '2026-10-01' } }]
  const result = await runTurn(empty(), '', materials)
  assert.equal(result.agentState.collectedFacts[0].materialId, 'a1')
  assert.equal(result.agentState.collectedFacts[0].confirmed, true)
  assert.deepEqual(result.agentState.quickReplies, [])
  assert.deepEqual((provider.mock.calls[0].arguments[1] as any).messages, [
    { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
    { role: 'user', content: '上传了材料' },
  ])
})

test('action-only turns use event text and still get one ordinary model reply', async () => {
  for (const action of ['confirm', 'confirm:correct', 'edit', 'confirm:edit', 'edit:injury_status', 'finish', 'no_more_materials', 'generate_report', 'upload', 'manual_input']) {
    const result = await runTurn(empty(), '', [], action)
    assert.equal(result.assistantText, '模型自然回复')
    const messages = (provider.mock.calls.at(-1)!.arguments[1] as any).messages
    assert.equal(messages.length, 2)
    assert.deepEqual(messages[0], { role: 'system', content: CONVERSATION_SYSTEM_PROMPT })
    assert.equal(messages[1].role, 'user')
    assert.ok(messages[1].content)
  }
  assert.equal(provider.mock.callCount(), 10)
})

test('provider failures and empty replies reject the turn without mutating input', async () => {
  const state: AgentState = { ...empty(), collectedFacts: [fact('accident_date', '2026-10-01', false)] }
  const original = structuredClone(state)
  for (const data of [{ choices: [] }, { choices: [{ message: { content: '' } }] }, { choices: [{ message: { content: '  ' } }] }, { choices: [{ message: { content: null } }] }]) {
    provider.mock.mockImplementation(async () => ({ data }))
    await assert.rejects(runTurn(state, '信息正确', [], 'confirm'), /MODEL_UNAVAILABLE/)
    assert.deepEqual(state, original)
  }
  provider.mock.mockImplementation(async () => { throw new Error('ETIMEDOUT') })
  await assert.rejects(runTurn(state, '继续'), /MODEL_UNAVAILABLE/)
  config.deepseek.apiKey = ''
  await assert.rejects(runTurn(state, '继续'), /MODEL_UNAVAILABLE/)
})
