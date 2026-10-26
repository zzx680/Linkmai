import type { LegalReference } from '../legal/types'

export type FactStatus = 'proposed' | 'confirmed' | 'rejected' | 'disputed'
export interface Fact {
  id: string; key: string; label: string; value: string; status: FactStatus
  source: 'user' | 'material' | 'legacy'; sourceId: string; evidenceRefs: string[]; revision: number
}
export interface Evidence { id: string; sourceId: string; fieldKey?: string; sourceHash: string; status: 'active' | 'replaced' }
export interface Conflict { id: string; key: string; factIds: string[]; status: 'open' | 'resolved'; resolutionFactId?: string }
export interface CalculatorVersion { id: string; status: 'pending' | 'approved' | 'retired'; legalRefs: string[]; reviewedBy?: string }
export interface RegionalParameter {
  id: string; version: string; code: 'meals_daily_cents' | 'nutrition_daily_cents'; jurisdiction: string
  from: string; to?: string; value: number; legalRefs: string[]; status: 'pending' | 'approved' | 'retired'; reviewedBy?: string
}
export interface CalculationItem {
  code: string; label: string; amountCents?: number; formula: string; factRefs: string[]
  parameterRefs: string[]; missingInputs: string[]; requiresReview: boolean
}
export interface Calculation {
  id: string; inputRevision: number; contextHash: string; calculatorVersion: string; jurisdiction: string; accidentDate: string
  items: CalculationItem[]; missingInputs: string[]; totalCents?: number; status: 'complete' | 'incomplete' | 'requires_review'
}
export type DocumentType = 'case_report' | 'evidence_catalog' | 'action_plan'
export type DocumentStatus = 'draft' | 'user_confirmed' | 'lawyer_review' | 'approved' | 'stale' | 'superseded'
export interface Document {
  id: string; type: DocumentType; version: number; inputRevision: number; contextHash: string
  skillVersion: string; promptVersion: string; templateVersion: string
  sections: Array<{ title: string; paragraphs: string[] }>; factRefs: string[]; evidenceRefs: string[]
  legalRefs: string[]; calculationId: string; status: DocumentStatus; riskReasons: string[]
  userConfirmedAt?: string; approvedAt?: string; reviewTaskId?: string; supersedesId?: string; createdAt: string
}
export interface ReviewTask {
  id: string; documentId: string; inputRevision: number; contextHash: string
  status: 'pending' | 'in_review' | 'approved' | 'returned' | 'stale' | 'cancelled'
  reasonCodes: string[]; reviewerId?: string; note?: string; returnItems?: string[]; dueAt: string; createdAt: string; completedAt?: string
}
export interface Run {
  id: string; inputRevision: number; contextHash: string; key: string; skillVersion: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'stale' | 'cancelled'
  attemptCount: number; leaseOwner?: string; leaseToken?: string; leaseExpiresAt?: string; availableAt: string
  documentIds: string[]; safeErrorCode?: string; createdAt: string
  modelSnapshot: { provider: string; modelId: string; modelConfigVersion: string }
  startedAt?: string; completedAt?: string; durationMs?: number
}
export interface AuditEvent { id: string; entityId: string; code: string; actorId: string; at: string }
export interface Workspace {
  caseId: string; revision: number; workflow: 'collecting' | 'confirming' | 'analyzing' | 'analysis_available' | 'review_pending' | 'ready'
  sourceHash: string; contextHash: string; facts: Fact[]; evidence: Evidence[]; conflicts: Conflict[]
  calculations: Calculation[]; documents: Document[]; reviews: ReviewTask[]; runs: Run[]; events: AuditEvent[]
}
export interface Reviewer { id: string; email: string; passwordHash: string; role: 'reviewer' | 'review_admin'; active: boolean; invitedBy?: string }
export interface LegalState { id: string; documentId: string; contentHash: string; sourceHash: string; jurisdiction: string; from: string; to?: string; active: boolean; approved: boolean; reviewedBy?: string }
export interface Sources {
  revision: number; paid: boolean
  facts: Array<{ id: string; key: string; label: string; value: string; sourceType: string; sourceId: string }>
  artifacts: Array<{ id: string; type: string; status: string; ossKey?: string; metadata?: { confirmed?: boolean; fields?: Array<{ key: string; label: string; value: string }> } }>
  getLegalReferences: (ids: string[]) => Promise<LegalReference[]>
}
export interface Control { calculators: CalculatorVersion[]; parameters: RegionalParameter[]; reviewers: Reviewer[]; legal: LegalState[] }
