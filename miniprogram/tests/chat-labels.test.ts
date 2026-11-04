import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getChatMessageText, getQuickReplyLabel, getQuickReplySelection } from '../src/components/AgentChat/labels'
import { processUserMessage as runTurn, type AgentState } from '../../server/src/services/agent'
import type { MessageInterpreter } from '../../server/src/services/agent-language'

// Every turn, including control actions, now gets a model-authored reply. Tests
// inject a deterministic interpreter so CI needs no provider credentials.
const modelReply = '已收到，请继续补充案件情况。'
const testInterpreter: MessageInterpreter = async () => ({ facts: [], reply: modelReply, status: 'model' })

async function processUserMessage(state: AgentState, text: string, action?: string) {
  return runTurn(state, text, [], action, testInterpreter)
}

test('accident choices send Chinese text and still advance the backend state', async () => {
  for (const [value, label] of [['traffic_accident', '交通事故'], ['work_injury', '工伤事故'], ['personal_injury', '意外伤害']]) {
    const selection = getQuickReplySelection({ value, label })
    assert.equal(selection.text, label)
    const { agentState, assistantText } = await processUserMessage({ stage: 'collecting', collectedFacts: [] }, selection.text, selection.action)
    assert.equal(agentState.collectedFacts[0].value, value)
    // The unified model reply is surfaced to the conversation, not the old local question.
    assert.equal(assistantText, modelReply)
    assert.equal(agentState.nextQuestion, modelReply)
  }
})

test('Chinese shortcut text preserves confirm, edit, finish and legacy control semantics', async () => {
  const pending: AgentState = { stage: 'confirming', collectedFacts: [
    { key: 'accident_type', label: '事故类型', value: 'traffic_accident', source: 'material', confidence: 'high', confirmed: false },
  ] }
  for (const value of ['confirm', 'confirm:correct']) {
    const selection = getQuickReplySelection({ value, label: '信息正确' })
    assert.equal(selection.action, value)
    const { agentState } = await processUserMessage(pending, selection.text, selection.action)
    assert.equal(agentState.collectedFacts[0].confirmed, true)
  }
  for (const [value, label] of [
    ['edit', '修改信息'], ['confirm:edit', '需要修改'], ['finish', '结束收集'],
    ['no_more_materials', '结束收集'], ['manual_input', '手动输入'], ['edit:accident_date', '事故日期'],
    ['upload', '上传材料'], ['generate_report', '查看报告'],
  ]) {
    const selection = getQuickReplySelection({ value, label })
    assert.deepEqual(selection, { text: label, action: value })
    const { agentState } = await processUserMessage({ stage: 'collecting', collectedFacts: [] }, selection.text, selection.action)
    assert.equal(agentState.collectedFacts.length, 0)
    if (value === 'edit:accident_date') assert.equal(agentState.editingFactKey, 'accident_date')
  }
})

test('only known saved codes and accident type fields are translated', () => {
  assert.equal(getChatMessageText('• 事故类型：traffic_accident\n• 事故地点：中山路口', 'assistant'), '• 事故类型：交通事故\n• 事故地点：中山路口')
  for (const content of ['文件名 traffic_accident.png', 'constructor', 'unknown_code', '我想修改信息']) {
    assert.equal(getChatMessageText(content, 'user'), content)
  }
  assert.equal(getQuickReplyLabel({ value: 'constructor' }), 'constructor')
  assert.equal(getQuickReplyLabel({ value: 'manual_input' }), '手动输入')
  assert.equal(getQuickReplySelection({ value: 'custom', text: '自定义选项', action: 'confirm' }).action, 'confirm')
})
