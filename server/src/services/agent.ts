// Conversation replies use ordinary chat history. Existing explicit controls and
// confirmed materials remain separate from free-form model output.
import { detectAccidentType, interpretUserMessage, validFactValue, type MessageInterpreter } from './agent-language'
import { reportFactDefinitions, reportReadiness, type CaseAgentContext } from '../harness/case-agent'
export interface AgentState {
  stage: 'collecting' | 'confirming' | 'analyzing' | 'ready'
  collectedFacts: CollectedFact[]
  pendingConfirmation?: CollectedFact[]
  editingFactKey?: string
  nextQuestion?: string
  quickReplies?: QuickReply[]
  lastTurn?: { skillId?: string; skillVersion?: string; promptVersion?: string; mode?: 'conversation'; modelStatus: 'model' }
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

const FACT_DEFINITIONS = reportFactDefinitions
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
  const control = normalizeAgentAction(action || '')
  const next = structuredClone(state)
  next.quickReplies = []
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
    if (key) {
      const value = correction ? text.slice(text.indexOf(text.includes('：') ? '：' : ':') + 1).trim() : text
      if (validFactValue(key, value)) {
        setFact(next, { ...textFact(key, key === 'accident_type' ? accidentType(value) || value : value), confirmed: false })
        delete next.editingFactKey
        next.stage = 'collecting'
      }
    }
  }
  // Ordinary chat never fills missing fields or accepts model-proposed facts.
  // Only an explicit edit or a separately confirmed material can change facts.
  next.pendingConfirmation = next.collectedFacts.filter(fact => !fact.confirmed).map(fact => ({ ...fact }))
  if (next.pendingConfirmation.length) {
    next.stage = 'confirming'
    next.quickReplies = [reply('信息正确', 'confirm'), reply('需要修改', 'edit')]
  } else if (next.stage !== 'ready' || !canGenerateReport(next)) {
    next.stage = 'collecting'
  }
  if (control === 'edit') next.quickReplies = next.collectedFacts.map(fact => reply(fact.label, `edit:${fact.key}`))
  const promptContext: CaseAgentContext = {
    facts: next.collectedFacts, report: { exists: false, stale: false }, recentMessages: [], materials: [], ...context,
    action: action ? control : undefined,
    editTarget: state.editingFactKey,
    attachedMaterials: materials.map(material => ({ id: material.artifactId, type: material.type, confirmed: material.confirmed === true })),
  }
  const understood = await interpret(next, text, promptContext)
  if (!understood.reply?.trim()) throw new Error('MODEL_UNAVAILABLE')
  next.nextQuestion = understood.reply
  next.lastTurn = { mode: 'conversation', modelStatus: 'model' }
  return { agentState: next, assistantText: understood.reply }
}

export function canGenerateReport(state: AgentState): boolean {
  return reportReadiness(state).factsReady
}
