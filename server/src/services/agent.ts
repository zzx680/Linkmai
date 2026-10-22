// Language understanding proposes facts; confirmation, materials, payments and
// report generation remain controlled state transitions.
import { contextualAdvice, detectAccidentType, interpretUserMessage, isAcknowledgement, isQuestion, localMessageFacts, validFactValue, type MessageInterpreter } from './agent-language'
export interface AgentState {
  stage: 'collecting' | 'confirming' | 'analyzing' | 'ready'
  collectedFacts: CollectedFact[]
  pendingConfirmation?: CollectedFact[]
  editingFactKey?: string
  nextQuestion?: string
  quickReplies?: QuickReply[]
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

const REQUIRED_FACTS = [
  { key: 'accident_type', label: '事故类型' },
  { key: 'accident_date', label: '事故日期' },
  { key: 'accident_location', label: '事故地点' },
  { key: 'parties_involved', label: '涉事方信息' },
  { key: 'accident_description', label: '事故经过' },
]
const FACT_DEFINITIONS = [...REQUIRED_FACTS, { key: 'liability', label: '责任认定' }]
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
  return REQUIRED_FACTS.find(required => !state.collectedFacts.some(
    fact => fact.key === required.key && fact.confirmed && fact.value.trim()
  ))
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
    return { question: '信息收集完成，可前往报告页面生成报告', quickReplies: [reply('查看报告', 'generate_report'), reply('修改信息', 'edit')] }
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
): Promise<AgentState> {
  // 不共享数组/事实对象，失败的请求和历史状态不会被意外修改。
  const next: AgentState = { ...state, collectedFacts: state.collectedFacts.map(fact => ({ ...fact })) }
  const text = userMessage.trim()
  const control = normalizeAgentAction(action || text)
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
    return updatePrompt(next)
  }
  if (control === 'edit') {
    next.stage = 'collecting'
    delete next.editingFactKey
    updatePrompt(next)
    next.nextQuestion = '请选择需要修改的字段，或输入“字段名：修改后的内容”'
    next.quickReplies = next.collectedFacts.map(fact => reply(fact.label, `edit:${fact.key}`))
    return next
  }
  if (control.startsWith('edit:')) {
    const key = control.slice(5)
    if (FACT_DEFINITIONS.some(fact => fact.key === key)) {
      next.editingFactKey = key
      next.stage = 'collecting'
    }
    return updatePrompt(next)
  }
  if (control === 'finish' || control === 'generate_report') {
    if (canGenerateReport(next)) next.stage = 'ready'
    return updatePrompt(next)
  }
  if (control === 'upload' || control === 'manual_input' || !text) return updatePrompt(next)

  const correction = FACT_DEFINITIONS.find(fact => text.startsWith(`${fact.label}：`) || text.startsWith(`${fact.label}:`) || text.startsWith(`${fact.key}:`))
  const key = next.editingFactKey || correction?.key
  let response = ''
  if (key) {
    const value = correction ? text.slice(text.indexOf(text.includes('：') ? '：' : ':') + 1).trim() : text
    if (validFactValue(key, value)) {
      setFact(next, textFact(key, key === 'accident_type' ? accidentType(value) || value : value))
      delete next.editingFactKey
      next.stage = 'collecting'
    } else response = '还没有收到有效的字段内容，请补充具体信息；不清楚的内容可以稍后核对'
  } else if (isAcknowledgement(text)) {
    response = next.collectedFacts.some(fact => !fact.confirmed)
      ? '请核对已整理的信息，确认无误后点击「信息正确」；需要调整可点击「需要修改」'
      : '这条回复没有包含新的事故信息，请补充下面问题的具体内容；不清楚的内容可以稍后核对'
  } else {
    const missing = missingFact(next)
    const localFacts = localMessageFacts(text)
    const naturalMessage = !['traffic_accident', 'work_injury', 'personal_injury'].includes(text)
      && (text.length >= 12 || isQuestion(text) || localFacts.some(fact => fact.key === 'accident_description') || localFacts.length > 1)
    if (naturalMessage) {
      const understood = await interpret(next, text)
      const changedFacts = understood.facts.filter(fact => !next.collectedFacts.some(existing => existing.key === fact.key && existing.value === fact.value))
      for (const fact of understood.facts) {
        if (!FACT_DEFINITIONS.some(definition => definition.key === fact.key) || !validFactValue(fact.key, fact.value)) continue
        // Validate injected interpreters too; only literal user evidence may become a fact.
        if (!text.includes(fact.evidence) || (fact.key !== 'accident_type' && !fact.evidence.includes(fact.value))) continue
        if (fact.key === 'accident_type' && accidentType(fact.evidence) !== fact.value) continue
        const existing = next.collectedFacts.find(item => item.key === fact.key)
        if (existing?.value === fact.value) continue
        const directAnswer = changedFacts.length === 1 && missing?.key === fact.key
          && !isQuestion(text) && !next.collectedFacts.some(item => !item.confirmed) && next.stage !== 'ready'
        setFact(next, { ...textFact(fact.key, fact.value), confidence: directAnswer ? 'high' : 'medium', confirmed: directAnswer })
      }
      response = contextualAdvice(text) || understood.reply
      if (next.collectedFacts.some(fact => !fact.confirmed)) next.stage = 'confirming'
      // A detailed answer can still be a single value for the active field, but
      // never treat a question or greeting as an answer to that field.
      if (understood.facts.length === 0 && !isQuestion(text)
        && !next.collectedFacts.some(fact => !fact.confirmed) && next.stage !== 'ready' && missing
        && missing.key !== 'accident_description' && validFactValue(missing.key, text)) {
        const value = missing.key === 'accident_type' ? accidentType(text) : text
        if (value) setFact(next, textFact(missing.key, value))
      }
    } else if (!next.collectedFacts.some(fact => !fact.confirmed) && next.stage !== 'ready' && missing
      && !isQuestion(text) && validFactValue(missing.key, text)) {
      const value = missing.key === 'accident_type' ? accidentType(text) : text
      if (value) setFact(next, textFact(missing.key, value))
    }
  }
  updatePrompt(next)
  if (response) next.nextQuestion = `${response}\n\n${next.nextQuestion}`
  return next
}

export function canGenerateReport(state: AgentState): boolean {
  return !state.editingFactKey && !state.collectedFacts.some(fact => !fact.confirmed) && !missingFact(state)
}
