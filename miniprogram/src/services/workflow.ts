import { request } from './api'
export interface WorkflowFact { id: string; key: string; label: string; value: string; status: string; evidenceRefs: string[] }
export interface WorkflowDocument {
  id: string; type: string; version: number; status: string; inputRevision: number; riskReasons: string[]
  sections: Array<{ title: string; paragraphs: string[] }>; reviewTaskId?: string
}
export interface WorkflowWorkspace {
  caseId: string; revision: number; workflow: string; facts: WorkflowFact[]
  evidence: Array<{ id: string; sourceId: string; fieldKey?: string; status: string }>
  conflicts: Array<{ id: string; key: string; factIds: string[]; status: string }>
  calculations: Array<{ id: string; status: string; totalCents?: number; contextHash: string; items: Array<{ code: string; label: string; amountCents?: number; formula: string; missingInputs: string[] }> }>
  documents: WorkflowDocument[]; contextHash: string
  legalReferences: Array<{ id: string; title: string; articleNumber: string; content: string; sourceUrl: string; from: string; to?: string }>
  reviews: Array<{ id: string; status: string; documentId: string; dueAt: string; note?: string; returnItems?: string[] }>
  runs: Array<{ id: string; status: string; safeErrorCode?: string }>
}
const base = (caseId: string) => `/workflow/${encodeURIComponent(caseId)}`
export const workflowApi = {
  enabled: () => request<{ features?: { caseHarness?: boolean } }>({ url: '/health' }).then(result => result.features?.caseHarness === true),
  get: (caseId: string) => request<WorkflowWorkspace>({ url: `${base(caseId)}/workspace` }),
  propose: (caseId: string, input: { key: string; label: string; value: string; evidenceRefs: string[] }) => request<WorkflowFact>({ url: `${base(caseId)}/facts`, method: 'POST', data: input }),
  decide: (caseId: string, factId: string, decision: 'confirm' | 'reject') => request({ url: `${base(caseId)}/facts/${encodeURIComponent(factId)}/${decision}`, method: 'POST' }),
  resolve: (caseId: string, conflictId: string, factId: string) => request({ url: `${base(caseId)}/conflicts/${encodeURIComponent(conflictId)}/resolve`, method: 'POST', data: { factId } }),
  calculate: (caseId: string) => request({ url: `${base(caseId)}/calculations`, method: 'POST' }),
  generate: (caseId: string) => request({ url: `${base(caseId)}/documents/drafts`, method: 'POST' }),
  retry: (caseId: string, runId: string) => request({ url: `${base(caseId)}/runs/${encodeURIComponent(runId)}/retry`, method: 'POST' }),
  confirm: (caseId: string, documentId: string) => request({ url: `${base(caseId)}/documents/${encodeURIComponent(documentId)}/confirm`, method: 'POST', data: { reviewConsentVersion: 'review-v1' } }),
  revise: (caseId: string, documentId: string) => request({ url: `${base(caseId)}/documents/${encodeURIComponent(documentId)}/revise`, method: 'POST' }),
}
