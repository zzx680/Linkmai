import { randomUUID } from 'node:crypto'
import { config } from '../config'
import { db } from '../db'
import { memoryDB } from '../db/memory'
import { db as postgresDB, pool } from '../db/postgres'
import { Control, Sources, Workspace } from './types'
import { fingerprint } from './calculator'
import { coreTrafficLegalSections } from '../legal/core-traffic-law'
import { LegalDocument, LegalSection } from '../legal/types'
import { PoolClient } from 'pg'

export const id = () => randomUUID()
const clone = <T>(value: T): T => structuredClone(value)
const empty = (caseId: string, revision: number): Workspace => ({ caseId, revision, workflow: 'collecting', sourceHash: '', contextHash: '',
  facts: [], evidence: [], conflicts: [], calculations: [], documents: [], reviews: [], runs: [], events: [] })
const entityTables = {
  facts: 'harness_facts', evidence: 'evidence_references', conflicts: 'fact_conflicts', calculations: 'calculation_results',
  documents: 'document_versions', reviews: 'review_tasks', events: 'review_events',
} as const
const memory = new Map<string, Workspace>()
const memoryControl: Control = { calculators: [], parameters: [], reviewers: [], legal: [] }
const memoryLegalSources = new Map<string, string>()
let serial: Promise<unknown> = Promise.resolve()
async function memoryLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = serial
  let release!: () => void
  serial = new Promise<void>(resolve => { release = resolve })
  await previous
  try { return await fn() } finally { release() }
}
export type CaseCommand<T> = (state: Workspace, sources: Sources, control: Control) => T | Promise<T>

export class WorkflowStore {
  constructor(private readonly usePostgres = config.database.type === 'postgres') {}
  async transaction<T>(userId: string, caseId: string, command: CaseCommand<T>): Promise<T> {
    if (!this.usePostgres) return memoryLock(async () => {
      const item = await db.findCaseById(userId, caseId)
      if (!item) throw new Error('CASE_NOT_FOUND')
      const state = clone(memory.get(caseId) || empty(caseId, item.inputRevision))
      const before = item.inputRevision
      const entitlement = await db.getOrCreateCaseEntitlement(userId, caseId)
      const sources: Sources = { revision: before, paid: entitlement?.status === 'paid',
        facts: await db.getCaseFacts(caseId), artifacts: await db.getArtifactsByCase(caseId),
        getLegalReferences: refs => db.getLegalReferences(refs) }
      await this.loadMemoryLegal()
      const control = clone(memoryControl)
      const result = await command(state, sources, control)
      // Legacy memory writes may run while an async command is executing: reject, never overwrite.
      if ((await db.findCaseById(userId, caseId))?.inputRevision !== before) throw new Error('INPUT_STALE')
      if (state.revision !== before) await memoryDB.advanceHarnessRevision(userId, caseId, before, state.revision)
      await memoryDB.syncHarnessReportState(userId, caseId, sources.paid && state.documents.some(d => d.type === 'case_report' && d.status === 'approved' && d.contextHash === state.contextHash))
      memory.set(caseId, state)
      return clone(result)
    })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Serialize policy publication with all case commands, including final publication.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('linkmai_harness_policy'))")
      const owned = await client.query('SELECT input_revision FROM cases WHERE id=$1 AND user_id=$2 FOR UPDATE', [caseId, userId])
      if (!owned.rows[0]) throw new Error('CASE_NOT_FOUND')
      const revision = owned.rows[0].input_revision
      const existing = await client.query('SELECT payload FROM harness_case_state WHERE case_id=$1', [caseId])
      const state: Workspace = existing.rows[0]?.payload || empty(caseId, revision)
      for (const [key, table] of Object.entries(entityTables)) {
        const result = await client.query(`SELECT payload FROM ${table} WHERE case_id=$1 ORDER BY id`, [caseId])
        ;(state as unknown as Record<string, unknown>)[key] = result.rows.map(row => row.payload)
      }
      state.runs = (await client.query("SELECT harness_payload FROM agent_runs WHERE case_id=$1 AND task='case_bundle' ORDER BY created_at", [caseId])).rows.map(row => row.harness_payload)
      const entitlement = await client.query('SELECT status FROM case_entitlements WHERE case_id=$1 AND user_id=$2 FOR UPDATE', [caseId, userId])
      const facts = (await client.query('SELECT * FROM case_facts WHERE case_id=$1', [caseId])).rows.map(row => ({ id: row.id, key: row.fact_key,
        label: row.label, value: row.value, sourceType: row.source_type, sourceId: row.source_id }))
      const artifacts = (await client.query('SELECT id,type,status,metadata,oss_key AS "ossKey" FROM artifacts WHERE case_id=$1 ORDER BY id', [caseId])).rows
      const control = await this.loadControl(client)
      const result = await command(state, { revision, paid: entitlement.rows[0]?.status === 'paid', facts, artifacts,
        getLegalReferences: refs => postgresDB.getLegalReferences(refs, client) }, control)
      if (state.revision !== revision) {
        await client.query("UPDATE cases SET input_revision=$1,has_report=FALSE,status='collecting',status_label='案件信息已更新',updated_at=NOW() WHERE id=$2", [state.revision, caseId])
        await client.query('INSERT INTO case_revisions(id,case_id,input_revision,reason_code,changed_entity_type) VALUES($1,$2,$3,$4,$5)',
          [id(), caseId, state.revision, 'harness_input_change', 'fact'])
      }
      const summary = { ...state, facts: [], evidence: [], conflicts: [], calculations: [], documents: [], reviews: [], runs: [], events: [] }
      await client.query('INSERT INTO harness_case_state(case_id,payload) VALUES($1,$2) ON CONFLICT(case_id) DO UPDATE SET payload=EXCLUDED.payload', [caseId, JSON.stringify(summary)])
      for (const [key, table] of Object.entries(entityTables)) {
        for (const value of state[key as keyof typeof entityTables]) {
          await client.query(`INSERT INTO ${table}(id,case_id,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload WHERE ${table}.case_id=EXCLUDED.case_id`, [value.id, caseId, JSON.stringify(value)])
        }
      }
      for (const run of state.runs) {
        await client.query(`INSERT INTO agent_runs(id,case_id,task,input_revision,skill_version,idempotency_key,status,harness_payload,lease_owner,lease_expires_at,attempt_count,safe_error_code,started_at,completed_at)
          VALUES($1,$2,'case_bundle',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,harness_payload=EXCLUDED.harness_payload,
          lease_owner=EXCLUDED.lease_owner,lease_expires_at=EXCLUDED.lease_expires_at,attempt_count=EXCLUDED.attempt_count,safe_error_code=EXCLUDED.safe_error_code,
          started_at=EXCLUDED.started_at,completed_at=EXCLUDED.completed_at,updated_at=NOW()`,
          [run.id, caseId, run.inputRevision, run.skillVersion, run.key, run.status, JSON.stringify(run), run.leaseOwner || null, run.leaseExpiresAt || null, run.attemptCount,
            run.safeErrorCode || null, run.startedAt || null, run.completedAt || null])
      }
      const ready = entitlement.rows[0]?.status === 'paid' && state.documents.some(d => d.type === 'case_report' && d.status === 'approved' && d.contextHash === state.contextHash)
      await client.query(`UPDATE cases SET has_report=$1,status=CASE WHEN $1 THEN 'ready' WHEN status='ready' THEN 'collecting' ELSE status END,
        status_label=CASE WHEN $1 THEN '报告已复核' WHEN status='ready' THEN '等待核对与复核' ELSE status_label END WHERE id=$2`, [ready, caseId])
      await client.query('COMMIT')
      return result
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  private async loadControl(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }): Promise<Control> {
    const load = async (table: string) => (await client.query(`SELECT payload FROM ${table} ORDER BY id`)).rows.map(row => row.payload)
    const legal = (await client.query(`SELECT s.legal_ref_id,s.document_id,s.content_hash,d.source_hash,d.jurisdiction,d.effective_from::text,d.effective_to::text,d.status,d.review_status,d.reviewed_by
    FROM legal_sections s JOIN legal_documents d ON d.id=s.document_id`)).rows.map(row => ({ id: row.legal_ref_id, documentId: row.document_id, reviewedBy: row.reviewed_by || undefined, contentHash: row.content_hash,
      sourceHash: row.source_hash, jurisdiction: row.jurisdiction, from: row.effective_from, to: row.effective_to || undefined,
      active: row.status === 'active', approved: row.review_status === 'approved' }))
    return { calculators: await load('calculator_versions'), parameters: await load('regional_parameters'), reviewers: await load('reviewers'), legal }
  }
  private async loadMemoryLegal() {
    const references = await db.getLegalReferences([...new Set([...coreTrafficLegalSections.map(section => section.legalRefId), ...memoryControl.legal.map(ref => ref.id)])])
    for (const ref of references) {
      const existing = memoryControl.legal.find(item => item.id === ref.legalRefId)
      const value = {
      id: ref.legalRefId, documentId: ref.documentId, contentHash: ref.contentHash, sourceHash: ref.sourceHash,
      jurisdiction: ref.jurisdiction, from: ref.effectiveFrom, to: ref.effectiveTo, active: ref.status === 'active', approved: ref.reviewStatus === 'approved',
      reviewedBy: existing?.reviewedBy,
      }
      if (existing) Object.assign(existing, value); else memoryControl.legal.push(value)
    }
  }
  async control<T>(fn: (control: Control) => T | Promise<T>, actorId = 'system', write?: (client?: PoolClient) => Promise<void>): Promise<T> {
    if (!this.usePostgres) return memoryLock(async () => {
      await this.loadMemoryLegal()
      const copy = clone(memoryControl); const result = await fn(copy); await write?.()
      for (const ref of copy.legal) {
        const previous = memoryControl.legal.find(item => item.id === ref.id)
        if (previous && (ref.active !== previous.active || ref.approved !== previous.approved)) await memoryDB.updateLegalPolicy(ref.documentId, ref.approved, ref.active)
      }
      Object.assign(memoryControl, copy); return clone(result)
    })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SELECT pg_advisory_xact_lock(hashtext('linkmai_harness_policy'))")
      const control = await this.loadControl(client)
      const before = clone(control)
      const result = await fn(control)
      await write?.(client)
      for (const [key, table] of [['calculators','calculator_versions'], ['parameters','regional_parameters'], ['reviewers','reviewers']] as const) {
        for (const row of control[key]) {
          if (fingerprint(before[key].find(item => item.id === row.id)) === fingerprint(row)) continue
          if (key === 'reviewers') {
            await client.query('INSERT INTO reviewers(id,email,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,payload=EXCLUDED.payload', [row.id, (row as Control['reviewers'][number]).email, JSON.stringify(row)])
          } else await client.query(`INSERT INTO ${table}(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload`, [row.id, JSON.stringify(row)])
        }
      }
      const changedDocuments = new Set<string>()
      for (const ref of control.legal) {
        const previous = before.legal.find(item => item.id === ref.id)
        if (previous && !changedDocuments.has(ref.documentId) && (ref.active !== previous.active || ref.approved !== previous.approved || ref.reviewedBy !== previous.reviewedBy)) {
          await client.query("UPDATE legal_documents SET status=$1,review_status=$2,reviewed_by=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$4",
            [ref.active ? 'active' : 'repealed', ref.approved ? 'approved' : 'rejected', actorId, ref.documentId])
          changedDocuments.add(ref.documentId)
        }
      }
      for (const key of ['calculators','parameters','reviewers','legal'] as const) for (const row of control[key]) {
        const previous = before[key].find(item => item.id === row.id)
        if (fingerprint(previous) !== fingerprint(row)) await client.query('INSERT INTO harness_admin_events(actor_id,entity_id,code) VALUES($1,$2,$3)', [actorId, row.id, `${key.toUpperCase()}_CHANGED`])
      }
      await client.query('COMMIT'); return result
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }
  async importLegal(actorId: string, document: LegalDocument, sections: LegalSection[], sourceText: string) {
    return this.control(control => {
      if (!control.reviewers.some(actor => actor.id === actorId && actor.active && actor.role === 'review_admin')) throw new Error('REVIEWER_FORBIDDEN')
      if (control.legal.some(ref => ref.documentId === document.id)) throw new Error('VERSION_IMMUTABLE')
      if (new Set(sections.map(s => s.legalRefId)).size !== sections.length || sections.some(section => control.legal.some(ref => ref.id === section.legalRefId))) throw new Error('VERSION_IMMUTABLE')
      if (new Set(sections.map(s => s.articleNumber)).size !== sections.length) throw new Error('INVALID_LEGAL_SOURCE')
      // Persist review status separately; imported content is pending until explicitly reviewed.
      for (const section of sections) control.legal.push({ id: section.legalRefId, documentId: document.id, contentHash: section.contentHash,
        sourceHash: document.sourceHash, jurisdiction: document.jurisdiction, from: document.effectiveFrom, to: document.effectiveTo, active: true, approved: false })
      return { id: document.id, reviewStatus: 'pending' }
    }, actorId, async client => {
      if (!client) { await db.upsertLegalCorpus([document], sections); memoryLegalSources.set(document.id, sourceText); return }
      await client.query(`INSERT INTO legal_documents(id,title,authority,document_type,jurisdiction,effective_from,effective_to,status,review_status,source_url,source_hash,version)
        VALUES($1,$2,$3,$4,$5,$6,$7,'active','pending',$8,$9,$10)`, [document.id, document.title, document.authority, document.documentType,
        document.jurisdiction, document.effectiveFrom, document.effectiveTo || null, document.sourceUrl, document.sourceHash, document.version])
      for (const section of sections) await client.query(`INSERT INTO legal_sections(id,document_id,legal_ref_id,article_number,content,keywords,content_hash,search_vector)
        VALUES($1,$2,$3,$4,$5,$6,$7,to_tsvector('simple',$8))`, [section.id, document.id, section.legalRefId, section.articleNumber,
        section.content, section.keywords, section.contentHash, `${section.content} ${section.keywords.join(' ')}`])
      await client.query('INSERT INTO legal_versions(id,source_text,imported_by) VALUES($1,$2,$3)', [document.id, sourceText, actorId])
    })
  }
  async legalSource(documentId: string) {
    const refs = await this.control(c => c.legal.filter(ref => ref.documentId === documentId).map(ref => ref.id))
    if (!refs.length) throw new Error('LEGAL_DOCUMENT_NOT_FOUND')
    const sections = await db.getLegalReferences(refs)
    const sourceText = this.usePostgres ? (await pool.query('SELECT source_text FROM legal_versions WHERE id=$1', [documentId])).rows[0]?.source_text : memoryLegalSources.get(documentId)
    return { documentId, sections, sourceText: sourceText || null }
  }
  async casesForWork(): Promise<Array<{ caseId: string; userId: string }>> {
    if (!this.usePostgres) {
      const results = []
      for (const state of memory.values()) if (state.runs.some(run => ['queued','running'].includes(run.status))) {
        const userId = memoryOwners.get(state.caseId)
        if (userId && await db.findCaseById(userId, state.caseId)) results.push({ caseId: state.caseId, userId })
      }
      return results
    }
    return (await pool.query(`SELECT DISTINCT ar.case_id AS "caseId",c.user_id AS "userId" FROM agent_runs ar JOIN cases c ON c.id=ar.case_id
      WHERE ar.task='case_bundle' AND ar.status IN ('queued','running') LIMIT 100`)).rows
  }
  async reviewCases(reviewerId: string, admin: boolean): Promise<Array<{ caseId: string; userId: string }>> {
    if (!this.usePostgres) {
      const results = []
      for (const state of memory.values()) if (state.reviews.some(task => admin || task.reviewerId === reviewerId)) {
        const userId = memoryOwners.get(state.caseId)
        if (userId && await db.findCaseById(userId, state.caseId)) results.push({ caseId: state.caseId, userId })
      }
      return results
    }
    return (await pool.query(`SELECT DISTINCT rt.case_id AS "caseId",c.user_id AS "userId" FROM review_tasks rt JOIN cases c ON c.id=rt.case_id
      WHERE $1::boolean OR rt.payload->>'reviewerId'=$2`, [admin, reviewerId])).rows
  }
}
const memoryOwners = new Map<string, string>()
export const registerMemoryOwner = (caseId: string, userId: string) => memoryOwners.set(caseId, userId)
export const workflowStore = new WorkflowStore()
export const sourceDigest = (sources: Sources) => fingerprint({ facts: [...sources.facts].sort((a,b) => a.id.localeCompare(b.id)),
  artifacts: [...sources.artifacts].sort((a,b) => a.id.localeCompare(b.id)) })
