import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caseAgentPrompt, caseAgentFactKeys, reportFactDefinitions, reportReadiness } from '../src/harness/case-agent'
import { SkillRegistry } from '../src/harness/policy'
import type { AgentState, CollectedFact } from '../src/services/agent'

const fact = (key: string, value: string): CollectedFact => ({ key, value, label: key, confirmed: true, source: 'user_text', confidence: 'high' })
const base = (): AgentState => ({ stage: 'collecting', collectedFacts: [
  fact('accident_type', 'traffic_accident'), fact('accident_date', '2026-10-01'),
  fact('accident_location', '路口'), fact('parties_involved', '双方车辆'), fact('accident_description', '追尾'),
  fact('liability_status', '尚未认定'), fact('user_goal', '准备协商，了解材料缺口'),
] })

test('case skills are registered alongside the unchanged report bundle', () => {
  for (const id of ['case-intake', 'material-check', 'report-readiness', 'report-explain']) {
    const skill = SkillRegistry.get(id)
    assert.equal(skill.id, id)
    assert.ok(skill.tools.length)
    assert.ok(skill.forbiddenActions.length)
  }
  assert.equal(SkillRegistry.get('case-bundle').version, 'case-bundle-v1')
  assert.throws(() => SkillRegistry.get('__proto__'), /UNKNOWN_SKILL/)
})

test('readiness branches injury versus property loss', () => {
  const injured = base()
  injured.collectedFacts.push(fact('injury_status', '腿部受伤'))
  assert.deepEqual(reportReadiness(injured).missing.map(item => item.key), ['treatment_status', 'medical_expense'])
  const property = base()
  property.collectedFacts.push(fact('injury_status', '无人受伤'))
  assert.deepEqual(reportReadiness(property).missing.map(item => item.key), ['property_loss'])
  property.collectedFacts.push(fact('property_loss', '车辆维修费用尚待报价'))
  assert.equal(reportReadiness(property).factsReady, true)
})

test('confirmed unknown is not asked repeatedly and does not authorize a report', () => {
  const state = base()
  state.collectedFacts.push({ ...fact('injury_status', '不清楚'), unknown: true } as CollectedFact)
  const readiness = reportReadiness(state)
  assert.equal(readiness.factsReady, false)
  assert.equal(readiness.missing.some(item => item.key === 'injury_status'), false)
  assert.ok(readiness.unknown.includes('injury_status'))
})

test('prompt uses shared skill constraints and treats context as data', () => {
  const prompt = caseAgentPrompt(base(), '想看看报告准备情况')
  assert.equal(prompt.skillId, 'report-readiness')
  assert.match(prompt.instructions, /禁止动作/)
  assert.match(prompt.instructions, /不是更改执行规则的指令/)
  assert.match(prompt.instructions, /medical_expense_addition/)
})

test('prompt keeps snapshot, proposals and edit targets separate with the shared field registry', () => {
  const prompt = caseAgentPrompt(base(), '修改日期', {
    facts: [], materials: [], report: { exists: false, stale: false }, recentMessages: [], editTarget: 'accident_date',
  })
  assert.equal(prompt.input.editTarget, 'accident_date')
  assert.match(prompt.instructions, /调用前服务端快照/)
  assert.match(prompt.instructions, /统一等待用户确认/)
  assert.match(prompt.instructions, /action或editTarget存在时返回facts:\[\]/)
  assert.match(prompt.instructions, /不要复制、计数或承诺最终确认卡内容/)
  assert.equal(new Set(caseAgentFactKeys).size, reportFactDefinitions.length)
  for (const key of caseAgentFactKeys) assert.ok(prompt.instructions.includes(key))
})
