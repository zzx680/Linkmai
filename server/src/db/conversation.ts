import { createHash } from 'node:crypto'
import type { AgentState } from '../services/agent'
import type { ConfirmedCaseFactInput } from './harness'

export interface ConversationSnapshot {
  conversationId: string
  inputRevision: number
  stateHash: string
  materialHash: string
  messageCount: number
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}

export function conversationHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

export function conversationMaterialHash(artifacts: Array<{ id: string; type: string; status: string; metadata?: unknown }>): string {
  return conversationHash(artifacts.map(({ id, type, status, metadata }) => ({ id, type, status, metadata: metadata || {} }))
    .sort((a, b) => a.id.localeCompare(b.id)))
}

export function confirmedConversationFacts(state: AgentState, conversationId: string): ConfirmedCaseFactInput[] {
  return state.collectedFacts.filter(fact => fact.confirmed && !(fact as typeof fact & { unknown?: boolean }).unknown).map(fact => ({
    key: fact.key, label: fact.label, value: fact.value,
    source: fact.materialId ? `material:${fact.materialId}` : fact.source,
    sourceType: fact.materialId ? 'material' : 'conversation',
    sourceId: fact.materialId || conversationId, confidence: fact.confidence,
  }))
}

export interface ConversationCommit {
  userId: string
  caseId: string
  requestId: string
  requestHash: string
  text: string
  metadata?: Record<string, unknown>
  expected: ConversationSnapshot
  agentState: AgentState
  assistantText: string
}

export interface ConversationTurnResult {
  agentState: AgentState
  assistantText: string
  quickReplies: NonNullable<AgentState['quickReplies']>
}
