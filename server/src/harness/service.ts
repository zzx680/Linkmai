import { Control, Document, Fact, Sources, Workspace } from './types'
import { calculate, CALCULATOR_VERSION, fingerprint, integerInput, numericFactKeys } from './calculator'
import { applicableParameters, ContextBuilder, contextHash, currentLegalRefs, draftSections, ModelRouter, OutputValidator, requireCalculator, RiskValidator, SkillRegistry } from './policy'
import { id, registerMemoryOwner, sourceDigest, WorkflowStore, workflowStore } from './store'
import { getSignedUrl } from '../services/oss'

const timestamp = (now: number) => new Date(now).toISOString()
export function audit(state: Workspace, code: string, entityId: string, actorId: string, now = Date.now()) {
  state.events.push({ id: id(), code, entityId, actorId, at: timestamp(now) })
}
function invalidate(state: Workspace) {
  state.documents.forEach(doc => { if (!['stale','superseded'].includes(doc.status)) doc.status = 'stale' })
  state.reviews.forEach(task => { if (task.status !== 'cancelled') task.status = 'stale' })
  state.runs.forEach(run => { if (['queued','running'].includes(run.status)) { run.status = 'stale'; delete run.leaseToken; delete run.leaseOwner; delete run.leaseExpiresAt } })
  state.workflow = 'collecting'
}
function reconcileConflicts(state: Workspace) {
  const keys = new Set(state.facts.map(fact => fact.key))
  for (const key of keys) {
    const facts = state.facts.filter(fact => fact.key === key && ['confirmed','disputed'].includes(fact.status))
    const open = state.conflicts.find(conflict => conflict.key === key && conflict.status === 'open')
    if (new Set(facts.map(f => f.value)).size > 1) {
      facts.forEach(f => { f.status = 'disputed' })
      if (open) open.factIds = facts.map(f => f.id)
      else state.conflicts.push({ id: id(), key, factIds: facts.map(f => f.id), status: 'open' })
    } else if (open) {
      // Do not choose a winning fact silently when an underlying source disappears.
      facts.forEach(f => { f.status = 'proposed' })
      open.status = 'resolved'
    }
  }
}
function synchronize(state: Workspace, sources: Sources, control: Control) {
  const digest = sourceDigest(sources)
  const changed = state.sourceHash !== digest
  const oldHash = state.contextHash
  const revisionChanged = state.revision !== sources.revision
  if (state.revision !== sources.revision) { state.revision = sources.revision; invalidate(state) }
  if (changed) {
    if (state.sourceHash && !revisionChanged && oldHash) { state.revision++; invalidate(state) }
    state.sourceHash = digest
    state.evidence.forEach(e => { e.status = 'replaced' })
    const incoming: Fact[] = []
    for (const artifact of sources.artifacts) {
      if (!artifact.metadata?.confirmed) continue
      for (const field of artifact.metadata.fields || []) {
        const hash = fingerprint([artifact.id, field.key, field.value])
        const evidenceId = fingerprint(['evidence', hash])
        const existing = state.evidence.find(e => e.id === evidenceId)
        if (existing) existing.status = 'active'
        else state.evidence.push({ id: evidenceId, sourceId: artifact.id, fieldKey: field.key, sourceHash: hash, status: 'active' })
        incoming.push({ id: fingerprint(['material',hash]), key: field.key, label: field.label, value: String(field.value),
          status: 'confirmed', source: 'material', sourceId: artifact.id, evidenceRefs: [evidenceId], revision: state.revision })
      }
    }
    for (const fact of sources.facts.filter(f => f.sourceType !== 'material')) {
      incoming.push({ id: fingerprint(['legacy',fact.id,fact.value]), key: fact.key, label: fact.label, value: fact.value,
        status: 'confirmed', source: 'legacy', sourceId: fact.sourceId, evidenceRefs: [], revision: state.revision })
    }
    const active = new Set(incoming.map(f => f.id))
    state.facts.filter(f => f.source !== 'user' && !active.has(f.id)).forEach(f => { f.status = 'rejected' })
    state.facts.filter(f => f.source === 'user' && f.evidenceRefs.some(ref => !state.evidence.some(e => e.id === ref && e.status === 'active'))).forEach(f => { f.status = 'proposed' })
    for (const fact of incoming) {
      const existing = state.facts.find(item => item.id === fact.id)
      if (existing) Object.assign(existing, fact)
      else state.facts.push(fact)
    }
    reconcileConflicts(state)
  }
  state.contextHash = contextHash(state, control)
  if (oldHash && oldHash !== state.contextHash && !changed && !revisionChanged) {
    state.revision++
    state.contextHash = contextHash(state, control)
  }
  if (oldHash && oldHash !== state.contextHash) invalidate(state)
}
function changedInput(state: Workspace, control: Control, actor: string, entityId: string, code: string) {
  state.revision++; invalidate(state); state.contextHash = contextHash(state, control); audit(state, code, entityId, actor)
}
function queueRun(state: Workspace, sources: Sources, control: Control, userId: string, caseId: string, now: number) {
  requirePaid(sources)
  const ctx = ContextBuilder.build(state)
  requireCalculator(control, ctx.accidentDate, ctx.jurisdiction)
  const skill = SkillRegistry.get('case-bundle')
  const key = fingerprint([caseId, state.revision, state.contextHash, skill.version])
  const existing = state.runs.find(run => run.key === key)
  if (existing) return { runId: existing.id, status: existing.status }
  const run = { id: id(), inputRevision: state.revision, contextHash: state.contextHash, key, skillVersion: skill.version,
    status: 'queued' as const, attemptCount: 0, documentIds: [], createdAt: timestamp(now), availableAt: timestamp(now), modelSnapshot: ModelRouter.snapshot() }
  state.runs.push(run)
  audit(state, 'RUN_QUEUED', run.id, userId, now)
  return { runId: run.id, status: run.status }
}
function requirePaid(sources: Sources) { if (!sources.paid) throw new Error('PAYMENT_REQUIRED') }
function refreshWorkflow(state: Workspace) {
  const documents = state.documents.filter(d => d.contextHash === state.contextHash && !['stale','superseded'].includes(d.status))
  state.workflow = state.conflicts.some(c => c.status === 'open') || state.facts.some(f => f.status === 'proposed') ? 'confirming'
    : state.runs.some(r => ['queued','running'].includes(r.status)) ? 'analyzing'
      : documents.some(d => d.status === 'lawyer_review') ? 'review_pending'
        : documents.length && documents.every(d => d.status === 'approved') ? 'ready'
          : documents.length ? 'analysis_available' : 'collecting'
}
function findDocument(state: Workspace, documentId: string) {
  const document = state.documents.find(item => item.id === documentId)
  if (!document) throw new Error('DOCUMENT_NOT_FOUND')
  if (['stale','superseded'].includes(document.status) || document.contextHash !== state.contextHash || document.inputRevision !== state.revision) throw new Error('INPUT_STALE')
  return document
}
function validatePublication(state: Workspace, document: Document, control: Control) {
  if (state.facts.some(fact => ['proposed','disputed'].includes(fact.status))) throw new Error('FACT_CONFIRMATION_REQUIRED')
  const calculation = state.calculations.find(item => item.id === document.calculationId)
  if (!calculation) throw new Error('INVALID_CALCULATION_REFERENCE')
  const ctx = ContextBuilder.build(state)
  const version = requireCalculator(control, ctx.accidentDate, ctx.jurisdiction)
  const recomputed = calculate({ id: calculation.id, revision: state.revision, contextHash: state.contextHash,
    facts: ctx.facts, jurisdiction: ctx.jurisdiction, accidentDate: ctx.accidentDate, version, parameters: applicableParameters(control, ctx.accidentDate, ctx.jurisdiction) })
  if (fingerprint(recomputed) !== fingerprint(calculation)) throw new Error('CALCULATION_TAMPERED')
  OutputValidator.validate(document, state, calculation)
  const effective = new Set(currentLegalRefs(control, ctx.accidentDate, ctx.jurisdiction))
  const legalRefs = [...new Set([...version.legalRefs, ...calculation.items.flatMap(item => item.parameterRefs.flatMap(ref => control.parameters.find(p => p.id === ref)?.legalRefs || []))])]
  if (fingerprint([...document.legalRefs].sort()) !== fingerprint(legalRefs.sort())) throw new Error('INVALID_LEGAL_REFERENCE')
  if (document.legalRefs.some(ref => !effective.has(ref))) throw new Error('INVALID_LEGAL_REFERENCE')
  if (fingerprint(RiskValidator.check(ctx.facts, calculation)) !== fingerprint(document.riskReasons)) throw new Error('INVALID_RISK_ASSESSMENT')
  if (document.riskReasons.length && !state.reviews.some(task => task.id === document.reviewTaskId && task.documentId === document.id
    && task.status === 'approved' && task.inputRevision === state.revision && task.contextHash === state.contextHash)) throw new Error('LAWYER_REVIEW_REQUIRED')
  if (!document.userConfirmedAt) throw new Error('USER_CONFIRMATION_REQUIRED')
}
export class HarnessService {
  constructor(readonly store: WorkflowStore = workflowStore) {}
  private command<T>(userId: string, caseId: string, fn: (state: Workspace, sources: Sources, control: Control) => T | Promise<T>) {
    return this.store.transaction(userId, caseId, async (state, sources, control) => {
      registerMemoryOwner(caseId, userId)
      synchronize(state, sources, control)
      refreshWorkflow(state)
      const result = await fn(state, sources, control)
      refreshWorkflow(state)
      return result
    })
  }
  get(userId: string, caseId: string) {
    return this.command(userId, caseId, async (state, sources) => ({ ...state, events: undefined,
      legalReferences: sources.paid ? (await sources.getLegalReferences([...new Set(state.documents.filter(d => d.contextHash === state.contextHash).flatMap(d => d.legalRefs))]))
        .map(ref => ({ id: ref.legalRefId, title: ref.title, articleNumber: ref.articleNumber, content: ref.content,
          sourceUrl: ref.sourceUrl, from: ref.effectiveFrom, to: ref.effectiveTo })) : [],
      documents: sources.paid ? state.documents : [], calculations: sources.paid ? state.calculations : [],
      runs: state.runs.map(({ leaseToken: _token, leaseOwner: _owner, ...run }) => run) }))
  }
  propose(userId: string, caseId: string, input: { key: string; label: string; value: string; evidenceRefs: string[] }) {
    return this.command(userId, caseId, (state, _sources, control) => {
      if (numericFactKeys.has(input.key)) integerInput(input.value)
      if (input.key.startsWith('claim_') && !['yes','no'].includes(input.value)) throw new Error('INVALID_CLAIM_SCOPE')
      if (input.evidenceRefs.some(ref => !state.evidence.some(e => e.id === ref && e.status === 'active'))) throw new Error('INVALID_REFERENCE')
      const fact: Fact = { ...input, id: id(), source: 'user', sourceId: userId, status: 'proposed', revision: state.revision + 1 }
      state.facts.push(fact); changedInput(state, control, userId, fact.id, 'FACT_PROPOSED'); state.workflow = 'confirming'
      return fact
    })
  }
  decideFact(userId: string, caseId: string, factId: string, action: 'confirm' | 'reject') {
    return this.command(userId, caseId, (state, _sources, control) => {
      const fact = state.facts.find(f => f.id === factId)
      if (!fact || fact.status !== 'proposed') throw new Error('FACT_NOT_PROPOSED')
      fact.status = action === 'confirm' ? 'confirmed' : 'rejected'; reconcileConflicts(state)
      changedInput(state, control, userId, fact.id, action === 'confirm' ? 'FACT_CONFIRMED' : 'FACT_REJECTED')
      return fact
    })
  }
  resolve(userId: string, caseId: string, conflictId: string, factId: string) {
    return this.command(userId, caseId, (state, _sources, control) => {
      const conflict = state.conflicts.find(c => c.id === conflictId && c.status === 'open')
      if (!conflict || !conflict.factIds.includes(factId)) throw new Error('CONFLICT_NOT_FOUND')
      for (const fact of state.facts.filter(f => conflict.factIds.includes(f.id))) fact.status = fact.id === factId ? 'confirmed' : 'rejected'
      conflict.status = 'resolved'; conflict.resolutionFactId = factId
      changedInput(state, control, userId, conflict.id, 'CONFLICT_RESOLVED'); return conflict
    })
  }
  calculate(userId: string, caseId: string) {
    return this.command(userId, caseId, (state, sources, control) => {
      requirePaid(sources)
      const ctx = ContextBuilder.build(state)
      const version = requireCalculator(control, ctx.accidentDate, ctx.jurisdiction)
      const existing = state.calculations.find(c => c.contextHash === state.contextHash)
      if (existing) return existing
      const result = calculate({ id: id(), revision: state.revision, contextHash: state.contextHash, facts: ctx.facts,
        jurisdiction: ctx.jurisdiction, accidentDate: ctx.accidentDate, version, parameters: applicableParameters(control, ctx.accidentDate, ctx.jurisdiction) })
      state.calculations.push(result); audit(state, 'CALCULATION_CREATED', result.id, userId); return result
    })
  }
  enqueue(userId: string, caseId: string, now = Date.now()) {
    if (process.env.HARNESS_PAUSED === 'true') throw new Error('WORKFLOW_PAUSED')
    return this.command(userId, caseId, (state, sources, control) => queueRun(state, sources, control, userId, caseId, now))
  }
  claim(userId: string, caseId: string, worker: string, at?: number) {
    return this.command(userId, caseId, (state, sources) => {
      const now = at ?? Date.now()
      if (!sources.paid) return null
      const skill = SkillRegistry.get('case-bundle')
      const run = state.runs.find(r => r.status === 'queued' && r.availableAt <= timestamp(now)
        || r.status === 'running' && !!r.leaseExpiresAt && r.leaseExpiresAt <= timestamp(now))
      if (!run) return null
      if (run.attemptCount >= skill.maxAttempts) { run.status = 'failed'; run.safeErrorCode = 'ATTEMPTS_EXHAUSTED'; audit(state, 'RUN_FAILED', run.id, worker, now); return null }
      run.status = 'running'; run.attemptCount++; run.leaseOwner = worker; run.leaseToken = id(); run.leaseExpiresAt = timestamp(now + skill.leaseMs)
      delete run.safeErrorCode
      run.startedAt = timestamp(now)
      audit(state, 'RUN_CLAIMED', run.id, worker, now)
      return { run: structuredClone(run), snapshot: structuredClone(state), model: ModelRouter.snapshot() }
    })
  }
  complete(userId: string, caseId: string, runId: string, token: string, at?: number) {
    return this.command(userId, caseId, (state, sources, control) => {
      const now = at ?? Date.now()
      requirePaid(sources)
      const run = state.runs.find(r => r.id === runId)
      if (!run || run.status !== 'running' || run.leaseToken !== token || !run.leaseExpiresAt || run.leaseExpiresAt <= timestamp(now)) throw new Error('LEASE_LOST')
      if (run.contextHash !== state.contextHash) throw new Error('INPUT_STALE')
      const ctx = ContextBuilder.build(state)
      const version = requireCalculator(control, ctx.accidentDate, ctx.jurisdiction)
      let calculation = state.calculations.find(c => c.contextHash === state.contextHash)
      if (!calculation) {
        calculation = calculate({ id: id(), revision: state.revision, contextHash: state.contextHash, facts: ctx.facts,
          jurisdiction: ctx.jurisdiction, accidentDate: ctx.accidentDate, version, parameters: applicableParameters(control, ctx.accidentDate, ctx.jurisdiction) })
        state.calculations.push(calculation)
      }
      const skill = SkillRegistry.get('case-bundle')
      const reasons = RiskValidator.check(ctx.facts, calculation)
      for (const type of ['case_report','evidence_catalog','action_plan'] as const) {
        const previous = state.documents.filter(d => d.type === type).sort((a,b) => b.version - a.version)[0]
        const document: Document = { id: id(), type, version: (previous?.version || 0) + 1, inputRevision: state.revision,
          contextHash: state.contextHash, skillVersion: skill.version, promptVersion: skill.promptVersion, templateVersion: skill.templateVersion,
          sections: draftSections(type, state, calculation), factRefs: ctx.facts.map(f => f.id), evidenceRefs: [...new Set(ctx.facts.flatMap(f => f.evidenceRefs))],
          legalRefs: [...new Set([...version.legalRefs, ...calculation.items.flatMap(item => item.parameterRefs.flatMap(ref => control.parameters.find(p => p.id === ref)?.legalRefs || []))])], calculationId: calculation.id, status: 'draft', riskReasons: reasons,
          supersedesId: previous?.id, createdAt: timestamp(now) }
        OutputValidator.validate(document, state, calculation)
        if (previous && previous.status !== 'stale') previous.status = 'superseded'
        state.documents.push(document); run.documentIds.push(document.id)
        audit(state, 'DOCUMENT_DRAFTED', document.id, run.leaseOwner || 'worker', now)
      }
      run.status = 'succeeded'; delete run.leaseToken; delete run.leaseOwner; delete run.leaseExpiresAt
      run.completedAt = timestamp(now); run.durationMs = now - new Date(run.startedAt!).getTime()
      state.workflow = 'analysis_available'; audit(state, 'RUN_SUCCEEDED', run.id, 'worker', now)
      return run.documentIds
    })
  }
  fail(userId: string, caseId: string, runId: string, token: string, now = Date.now()) {
    return this.command(userId, caseId, state => {
      const run = state.runs.find(r => r.id === runId)
      if (!run || run.status !== 'running' || run.leaseToken !== token) return
      run.status = run.attemptCount < SkillRegistry.get('case-bundle').maxAttempts ? 'queued' : 'failed'
      run.availableAt = timestamp(now + 1000 * 2 ** run.attemptCount); run.safeErrorCode = 'WORKFLOW_EXECUTION_FAILED'
      delete run.leaseToken; delete run.leaseExpiresAt; delete run.leaseOwner
      audit(state, 'RUN_RETRY_OR_FAILURE', run.id, 'worker', now)
    })
  }
  confirm(userId: string, caseId: string, documentId: string, reviewConsentVersion?: string) {
    return this.command(userId, caseId, (state, sources, control) => {
      requirePaid(sources)
      const document = findDocument(state, documentId)
      if (state.reviews.some(task => task.documentId === document.id && task.status === 'returned')) throw new Error('NEW_DOCUMENT_VERSION_REQUIRED')
      if (document.userConfirmedAt) return document
      if (document.status !== 'draft') throw new Error('INVALID_DOCUMENT_TRANSITION')
      if (process.env.HARNESS_PAUSED === 'true') throw new Error('WORKFLOW_PAUSED')
      if (document.riskReasons.length && reviewConsentVersion !== 'review-v1') throw new Error('REVIEW_CONSENT_REQUIRED')
      document.userConfirmedAt = timestamp(Date.now()); document.status = 'user_confirmed'
      if (document.riskReasons.length) {
        audit(state, 'REVIEW_CONSENT_V1_RECORDED', document.id, userId)
        const task = { id: id(), documentId, inputRevision: state.revision, contextHash: state.contextHash, status: 'pending' as const,
          reasonCodes: document.riskReasons, dueAt: timestamp(Date.now() + 2 * 86400000), createdAt: timestamp(Date.now()) }
        state.reviews.push(task); document.reviewTaskId = task.id; document.status = 'lawyer_review'; state.workflow = 'review_pending'
        audit(state, 'REVIEW_REQUESTED', task.id, userId)
      } else {
        validatePublication(state, document, control); document.status = 'approved'; document.approvedAt = timestamp(Date.now()); state.workflow = 'ready'
      }
      audit(state, 'DOCUMENT_USER_CONFIRMED', document.id, userId); return document
    })
  }
  retry(userId: string, caseId: string, runId: string) {
    if (process.env.HARNESS_PAUSED === 'true') throw new Error('WORKFLOW_PAUSED')
    return this.command(userId, caseId, (state, sources, control) => {
      requirePaid(sources)
      const run = state.runs.find(r => r.id === runId && r.contextHash === state.contextHash && r.status === 'failed')
      if (!run) throw new Error('INVALID_RETRY_STATE')
      changedInput(state, control, userId, run.id, 'MANUAL_RETRY_REQUESTED')
      return queueRun(state, sources, control, userId, caseId, Date.now())
    })
  }
  async reviewQueue(reviewerId: string) {
    const actor = await this.store.control(c => c.reviewers.find(r => r.id === reviewerId && r.active))
    if (!actor) throw new Error('REVIEWER_FORBIDDEN')
    const cases = await this.store.reviewCases(reviewerId, actor.role === 'review_admin')
    const result = []
    for (const entry of cases) {
      const tasks = await this.command(entry.userId, entry.caseId, state => state.reviews.filter(task => actor.role === 'review_admin' || task.reviewerId === reviewerId)
        .map(task => ({ ...task, caseId: entry.caseId, overdue: task.dueAt < timestamp(Date.now()) && ['pending','in_review'].includes(task.status) })))
      result.push(...tasks)
    }
    return result
  }
  async reviewAction(actorId: string, caseId: string, taskId: string, action: 'assign' | 'open' | 'approve' | 'return', input: { reviewerId?: string; note?: string; returnItems?: string[] }) {
    const cases = await this.store.reviewCases(actorId, true)
    const owned = cases.find(c => c.caseId === caseId)
    if (!owned) throw new Error('REVIEW_NOT_FOUND')
    return this.command(owned.userId, caseId, async (state, sources, control) => {
      const actor = control.reviewers.find(r => r.id === actorId && r.active)
      const task = state.reviews.find(t => t.id === taskId)
      if (!actor || !task) throw new Error('REVIEWER_FORBIDDEN')
      requirePaid(sources)
      if (action === 'assign') {
        if (actor.role !== 'review_admin') throw new Error('REVIEWER_FORBIDDEN')
        const target = control.reviewers.find(r => r.id === input.reviewerId && r.active && r.role === 'reviewer')
        if (!target || !['pending','in_review'].includes(task.status)) throw new Error('INVALID_REVIEW_ASSIGNMENT')
        task.reviewerId = target.id; task.status = 'pending'; audit(state, 'REVIEW_ASSIGNED', task.id, actorId); return task
      }
      if (task.reviewerId !== actorId || actor.role !== 'reviewer') throw new Error('REVIEWER_FORBIDDEN')
      const document = findDocument(state, task.documentId)
      if (task.inputRevision !== state.revision || task.contextHash !== state.contextHash || !['pending','in_review'].includes(task.status)) throw new Error('INPUT_STALE')
      if (action === 'open') {
        task.status = 'in_review'; audit(state, 'REVIEW_ACCESSED', task.id, actorId)
        const previous = state.documents.find(d => d.id === document.supersedesId)
        const changes = previous ? [...new Set([...previous.sections, ...document.sections].map(section => section.title))]
          .filter(title => fingerprint(previous.sections.find(s => s.title === title)) !== fingerprint(document.sections.find(s => s.title === title)))
          .map(title => ({ title, before: previous.sections.find(s => s.title === title)?.paragraphs || [], after: document.sections.find(s => s.title === title)?.paragraphs || [] })) : []
        return { task, document, previous, changes,
          facts: state.facts.filter(f => document.factRefs.includes(f.id)), evidence: state.evidence.filter(e => document.evidenceRefs.includes(e.id)),
          legal: await sources.getLegalReferences(document.legalRefs),
          calculation: state.calculations.find(c => c.id === document.calculationId) }
      }
      requirePaid(sources)
      if (task.status !== 'in_review' || !input.note?.trim()) throw new Error('REVIEW_NOTE_REQUIRED')
      task.note = input.note; task.completedAt = timestamp(Date.now())
      if (action === 'return') {
        if (!input.returnItems?.length) throw new Error('RETURN_ITEMS_REQUIRED')
        task.status = 'returned'; task.returnItems = input.returnItems; document.status = 'draft'; delete document.userConfirmedAt
        audit(state, 'REVIEW_RETURNED', task.id, actorId); return task
      }
      task.status = 'approved'; validatePublication(state, document, control)
      document.status = 'approved'; document.approvedAt = timestamp(Date.now()); state.workflow = 'ready'
      audit(state, 'REVIEW_APPROVED', task.id, actorId); return task
    })
  }
  async reviewEvidence(actorId: string, caseId: string, taskId: string, evidenceId: string) {
    const owned = (await this.store.reviewCases(actorId, false)).find(c => c.caseId === caseId)
    if (!owned) throw new Error('REVIEWER_FORBIDDEN')
    return this.command(owned.userId, caseId, async (state, sources, control) => {
      const actor = control.reviewers.find(r => r.id === actorId && r.active && r.role === 'reviewer')
      const task = state.reviews.find(t => t.id === taskId && t.reviewerId === actorId && t.status === 'in_review')
      if (!actor || !task) throw new Error('REVIEWER_FORBIDDEN')
      requirePaid(sources)
      const document = findDocument(state, task.documentId)
      const evidence = state.evidence.find(e => e.id === evidenceId && e.status === 'active' && document.evidenceRefs.includes(e.id))
      if (!evidence) throw new Error('INVALID_REFERENCE')
      const artifact = sources.artifacts.find(item => item.id === evidence.sourceId)
      if (!artifact?.ossKey) throw new Error('EVIDENCE_NOT_FOUND')
      const url = await getSignedUrl(artifact.ossKey, 300)
      audit(state, 'REVIEW_EVIDENCE_ACCESSED', evidence.id, actorId)
      return { url, expiresIn: 300 }
    })
  }
  revise(userId: string, caseId: string, documentId: string) {
    return this.command(userId, caseId, (state, _sources, control) => {
      const document = findDocument(state, documentId)
      if (!state.reviews.some(t => t.documentId === document.id && t.status === 'returned')) throw new Error('RETURNED_REVIEW_REQUIRED')
      changedInput(state, control, userId, document.id, 'DOCUMENT_REVISION_REQUESTED')
      return { inputRevision: state.revision }
    })
  }
  approved(userId: string, caseId: string, documentId: string) {
    return this.command(userId, caseId, (state, sources, control) => {
      requirePaid(sources); const document = findDocument(state, documentId)
      if (document.status !== 'approved') throw new Error('DOCUMENT_NOT_APPROVED')
      validatePublication(state, document, control); audit(state, 'DOCUMENT_VIEWED', document.id, userId); return document
    })
  }
}
export const harness = new HarnessService()
export const supportedCalculatorVersion = CALCULATOR_VERSION
