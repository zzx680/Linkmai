import { createHash } from 'node:crypto'

export type AgentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale' | 'cancelled'
export interface ConfirmedCaseFactInput {
  key: string
  label: string
  value: string
  source: string
  sourceType?: string
  sourceId?: string
  confidence?: string
}
export interface CaseFact extends ConfirmedCaseFactInput {
  id: string
  caseId: string
  sourceType: string
  sourceId: string
  confirmationStatus: 'confirmed'
  revision: number
  confirmedAt: Date
  createdAt: Date
  updatedAt: Date
}
export interface CaseRevision {
  id: string
  caseId: string
  inputRevision: number
  reasonCode: string
  changedEntityType?: string
  changedEntityId?: string
  createdAt: Date
}
export interface AgentRunInput { caseId: string; task: string; inputRevision: number; skillVersion: string }
export interface AgentRun {
  id: string
  caseId: string
  task: string
  inputRevision: number
  skillVersion: string
  idempotencyKey: string
  status: AgentRunStatus
  output?: Record<string, unknown>
  safeErrorCode?: string
  startedAt?: Date | null
  completedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}
export interface AgentRunUpdate { status: AgentRunStatus; output?: Record<string, unknown>; safeErrorCode?: string }
export const terminalRunStatuses: AgentRunStatus[] = ['succeeded', 'failed', 'stale', 'cancelled']
export function runKey(input: AgentRunInput): string {
  return createHash('sha256').update(JSON.stringify([input.caseId, input.task, input.inputRevision, input.skillVersion])).digest('hex')
}
export interface NormalizedConfirmedCaseFact extends ConfirmedCaseFactInput {
  sourceType: string
  sourceId: string
}

export function normalizeConfirmedFacts(facts: ConfirmedCaseFactInput[]): NormalizedConfirmedCaseFact[] {
  const result = new Map<string, NormalizedConfirmedCaseFact>()
  for (const fact of facts) {
    if (!fact.key || !fact.label || typeof fact.value !== 'string' || !fact.source) throw new Error('INVALID_CASE_FACT')
    const [derivedType, derivedId] = fact.source.startsWith('material:')
      ? ['material', fact.source.slice('material:'.length)]
      : fact.source === 'user_text'
        ? ['conversation', 'user_text']
        : ['conversation', 'confirmed']
    const sourceType = fact.sourceType || derivedType
    const sourceId = fact.sourceId || derivedId
    result.set(fact.key, { ...fact, sourceType, sourceId })
  }
  return [...result.values()]
}
// A canonical fact is keyed by case/key. Re-confirming the same value does not
// rewrite its provenance or create another revision, even from a second source.
export function factChanged(previous: CaseFact | undefined, next: ConfirmedCaseFactInput): boolean {
  return !previous || previous.value !== next.value
}
export function confirmedFieldsChanged(previous: { confirmed?: boolean; fields?: unknown } | undefined, fields: unknown): boolean {
  const canonical = (value: unknown) => JSON.stringify((Array.isArray(value) ? value : []).map(field => ({ key: field.key, value: field.value })).sort((a, b) => a.key.localeCompare(b.key)))
  return !previous?.confirmed || canonical(previous.fields) !== canonical(fields)
}
export function validateRunTransition(previous: AgentRunStatus, next: AgentRunStatus): void {
  if (previous === next) return
  const allowed: Partial<Record<AgentRunStatus, AgentRunStatus[]>> = {
    queued: ['running', 'cancelled', 'stale'],
    running: terminalRunStatuses,
  }
  if (!allowed[previous]?.includes(next)) throw new Error('INVALID_AGENT_RUN_TRANSITION')
}
export function validateRunUpdate(update: AgentRunUpdate): void {
  if (!['queued', 'running', ...terminalRunStatuses].includes(update.status)) throw new Error('INVALID_AGENT_RUN_STATUS')
  if (update.safeErrorCode && !/^[A-Z0-9_]{1,100}$/.test(update.safeErrorCode)) throw new Error('INVALID_SAFE_ERROR_CODE')
}
