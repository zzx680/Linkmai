// Language understanding proposes facts; confirmation, materials, payments and
// report generation remain controlled state transitions.
import { detectAccidentType, interpretUserMessage, isAcknowledgement, isGreeting, isQuestion, localMessageFacts, validFactValue, type MessageInterpreter } from './agent-language'
import { reportFactDefinitions, reportReadiness, selectCaseAgentSkill, caseAgentSkills, CASE_AGENT_PROMPT_VERSION, type CaseAgentContext } from '../harness/case-agent'
export interface AgentState {
  stage: 'collecting' | 'confirming' | 'analyzing' | 'ready'
  collectedFacts: CollectedFact[]
  pendingConfirmation?: CollectedFact[]
  editingFactKey?: string
  nextQuestion?: string
  quickReplies?: QuickReply[]
  lastTurn?: { skillId: string; skillVersion: string; promptVersion: string; modelStatus: 'model' }
}

export interface CollectedFact {
  key: string
  label: string
  value: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  confirmed: boolean
  materialId?: string
}

export interface QuickReply {
  label: string
  value: string
  action?: string
}

export interface AgentMaterial {
  type: string
  artifactId?: string
  url?: string
  extractedData?: Record<string, unknown>
  confirmed?: boolean
}

const REQUIRED_FACTS = reportFactDefinitions
const FACT_DEFINITIONS = REQUIRED_FACTS
const CONTROL_ALIASES: Record<string, string> = {
  'confirm:correct': 'confirm',
  'confirm:edit': 'edit',
  no_more_materials: 'finish',
}

export function normalizeAgentAction(value: string): string {
  return CONTROL_ALIASES[value] || value
}

function reply(label: string, action: string): QuickReply {
  return { label, value: action, action }
}

function missingFact(state: AgentState) {
  const missingKey = reportReadiness(state).missing[0]?.key
  return REQUIRED_FACTS.find(fact => fact.key === missingKey)
}

export function generateNextQuestion(state: AgentState): { question: string; quickReplies?: QuickReply[] } {
  if (state.editingFactKey) {
    const label = FACT_DEFINITIONS.find(fact => fact.key === state.editingFactKey)?.label
    return { question: `请输入修改后的${label || state.editingFactKey}` }
  }
  if (state.collectedFacts.some(fact => !fact.confirmed)) {
    return {
      question: `请核对以下信息：\n${state.collectedFacts.filter(fact => !fact.confirmed).map(fact => `• ${fact.label}：${fact.key === 'accident_type' ? ({ traffic_accident: '交通事故', work_injury: '工伤事故', personal_injury: '意外伤害' } as Record<string, string>)[fact.value] || fact.value : fact.value}`).join('\n')}\n确认无误后继续；需要修改时请选择字段`,
      quickReplies: [reply('信息正确', 'confirm'), reply('需要修改', 'edit')],
    }
  }
  if (state.stage === 'ready') {
    return { question: '案件基础信息已整理好。您可以继续补充或修改，也可以前往报告页面查看生成条件。', quickReplies: [reply('查看报告', 'generate_report'), reply('修改信息', 'edit')] }
  }
  const missing = missingFact(state)
  switch (missing?.key) {
    case 'accident_type':
      return {
        question: '请问您遇到了什么类型的事故？',
        quickReplies: [
          { label: '交通事故', value: 'traffic_accident' },
          { label: '工伤事故', value: 'work_injury' },
          { label: '意外伤害', value: 'personal_injury' },
        ],
      }
    case 'accident_date': return { question: '事故发生在什么时间？' }
    case 'accident_location': return { question: '事故发生在哪里？请描述具体地点' }
    case 'parties_involved':
      return { question: '请提供涉事方信息（如对方车辆和驾驶员） 也可前往材料页面上传、识别并核对材料', quickReplies: [reply('上传材料', 'upload'), { label: '手动输入', value: 'manual_input' }] }
    case 'accident_description': return { question: '请详细描述事故经过' }
    case 'liability_status': return { question: '事故责任认定进展如何？' }
    case 'liability': return { question: '认定书如何记载责任？是否有争议？' }
    case 'injury_status': return { question: '事故中是否有人受伤？' }
    case 'treatment_status': return { question: '目前接受了哪些治疗？' }
    case 'medical_expense': return { question: '目前已发生的医疗费用是多少？请区分累计和新增费用' }
    case 'property_loss': return { question: '有哪些财产损失？金额尚未核实也可以说明' }
    case 'user_goal': return { question: '目前处于什么处理阶段，您主要希望解决什么问题？' }
    default:
      return { question: '主要信息已收集 还有材料需要补充吗？材料请在材料页面识别并核对确认', quickReplies: [reply('上传材料', 'upload'), reply('结束收集', 'finish'), reply('修改信息', 'edit')] }
  }
}

function updatePrompt(state: AgentState): AgentState {
  state.pendingConfirmation = state.collectedFacts.filter(fact => !fact.confirmed).map(fact => ({ ...fact }))
  if (state.pendingConfirmation.length) state.stage = 'confirming'
  else if (state.stage !== 'ready' || missingFact(state)) state.stage = 'collecting'
  const next = generateNextQuestion(state)
  state.nextQuestion = next.question
  state.quickReplies = next.quickReplies || []
  return state
}

function setFact(state: AgentState, fact: CollectedFact) {
  const index = state.collectedFacts.findIndex(existing => existing.key === fact.key)
  if (index < 0) state.collectedFacts.push(fact)
  else state.collectedFacts[index] = fact
}

function textFact(key: string, value: string): CollectedFact {
  return { key, label: FACT_DEFINITIONS.find(fact => fact.key === key)?.label || key, value, source: 'user_text', confidence: 'high', confirmed: true }
}

function accidentType(text: string): string | undefined {
  return detectAccidentType(text)
}

export async function processUserMessage(
  state: AgentState,
  userMessage: string,
  materials: AgentMaterial[] = [],
  action?: string,
  interpret: MessageInterpreter = interpretUserMessage,
  context?: CaseAgentContext,
): Promise<{ agentState: AgentState; assistantText: string }> {
  const text = userMessage.trim()
  const control = normalizeAgentAction(action || text)
  let editTarget = state.editingFactKey
  const next: AgentState = { ...state, collectedFacts: state.collectedFacts.map(fact => ({ ...fact })) }
  // Repair acknowledgement values stored as dates by older clients/servers.
  next.collectedFacts = next.collectedFacts.filter(fact => !(fact.source === 'user_text'
    && fact.key === 'accident_date' && (isAcknowledgement(fact.value) || isQuestion(fact.value))))

  for (const material of materials) {
    const data = material.extractedData
    if (!data) continue
    const parties = data.parties_involved || (data.parties_a || data.parties_b ? `甲方：${data.parties_a || ''}\n乙方：${data.parties_b || ''}` : undefined)
    for (const definition of FACT_DEFINITIONS) {
      const value = definition.key === 'parties_involved' ? parties : data[definition.key]
      if (typeof value !== 'string' || !value.trim()) continue
      setFact(next, { ...textFact(definition.key, value.trim()), source: 'material', confirmed: material.confirmed === true, materialId: material.artifactId })
    }
    next.stage = 'collecting'
  }

  if (control === 'confirm') {
    next.collectedFacts = next.collectedFacts.map(fact => ({ ...fact, confirmed: true }))
    delete next.editingFactKey
  } else if (control === 'edit') {
    next.stage = 'collecting'
    delete next.editingFactKey
    next.quickReplies = next.collectedFacts.map(fact => reply(fact.label, `edit:${fact.key}`))
  } else if (control.startsWith('edit:')) {
    const key = control.slice(5)
    if (FACT_DEFINITIONS.some(fact => fact.key === key)) {
      next.editingFactKey = key
      next.stage = 'collecting'
    }
  } else if (control === 'finish' || control === 'generate_report') {
    if (canGenerateReport(next)) next.stage = 'ready'
  } else if (control !== 'upload' && control !== 'manual_input' && text) {
    const correction = FACT_DEFINITIONS.find(fact => text.startsWith(`${fact.label}：`) || text.startsWith(`${fact.label}:`) || text.startsWith(`${fact.key}:`))
    const key = next.editingFactKey || correction?.key
    editTarget = key
    if (key) {
      const value = correction ? text.slice(text.indexOf(text.includes('：') ? '：' : ':') + 1).trim() : text
      if (validFactValue(key, value)) {
        setFact(next, { ...textFact(key, key === 'accident_type' ? accidentType(value) || value : value), confirmed: false })
        delete next.editingFactKey
        next.stage = 'collecting'
      }
    } else if (!isGreeting(text) && !isAcknowledgement(text)) {
      const missing = missingFact(next)
      const localFacts = localMessageFacts(text)
      if (localFacts.length) {
        for (const fact of localFacts) {
          if (!FACT_DEFINITIONS.some(definition => definition.key === fact.key) || !validFactValue(fact.key, fact.value)) continue
          const existing = next.collectedFacts.find(item => item.key === fact.key)
          if (existing?.value === fact.value) continue
          const directAnswer = localFacts.length === 1 && missing?.key === fact.key
            && !isQuestion(text) && !next.collectedFacts.some(item => !item.confirmed) && next.stage !== 'ready'
          setFact(next, { ...textFact(fact.key, fact.value), confidence: directAnswer ? 'high' : 'medium', confirmed: directAnswer })
        }
      } else if (!next.collectedFacts.some(fact => !fact.confirmed) && next.stage !== 'ready' && missing
        && missing.key !== 'accident_description' && !isQuestion(text) && validFactValue(missing.key, text)) {
        const value = missing.key === 'accident_type' ? accidentType(text) : text
        if (value) setFact(next, textFact(missing.key, value))
      }
    }
  }
  updatePrompt(next)
  if (control === 'edit') next.quickReplies = next.collectedFacts.map(fact => reply(fact.label, `edit:${fact.key}`))
  const promptContext: CaseAgentContext = { facts: next.collectedFacts, report: { exists: false, stale: false }, recentMessages: [], ...context,
    action: action ? control : ['confirm', 'edit', 'finish', 'generate_report', 'upload', 'manual_input'].includes(control) || control.startsWith('edit:') ? control : undefined,
    editTarget,
    materials: context?.materials || [],
    attachedMaterials: materials.map(material => ({ id: material.artifactId, type: material.type, confirmed: material.confirmed === true })) }
  const skillId = selectCaseAgentSkill(next, text, promptContext)
  const understood = await interpret(next, text, promptContext)
  if (!understood.reply?.trim()) throw new Error('MODEL_UNAVAILABLE')
  if (!promptContext.action && !editTarget && !next.editingFactKey && !isGreeting(text) && !isAcknowledgement(text)) {
    for (const fact of understood.facts) {
      if (!FACT_DEFINITIONS.some(definition => definition.key === fact.key) || !validFactValue(fact.key, fact.value)) continue
      if (!text.includes(fact.evidence) || (fact.key !== 'accident_type' && !fact.evidence.includes(fact.value))) continue
      if (fact.key === 'accident_type' && accidentType(fact.evidence) !== fact.value) continue
      const existing = next.collectedFacts.find(item => item.key === fact.key)
      if (existing?.value === fact.value) continue
      setFact(next, { ...textFact(fact.key, fact.value), confidence: 'medium', confirmed: false })
    }
    updatePrompt(next)
  }
  next.nextQuestion = understood.reply
  next.lastTurn = { skillId, skillVersion: caseAgentSkills[skillId].version, promptVersion: CASE_AGENT_PROMPT_VERSION, modelStatus: 'model' }
  return { agentState: next, assistantText: understood.reply }
}

export function canGenerateReport(state: AgentState): boolean {
  return reportReadiness(state).factsReady
}
