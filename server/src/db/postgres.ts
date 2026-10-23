import { safeError } from '../utils/safe-error'
import { randomBytes } from 'crypto'
import { Pool, PoolClient } from 'pg'
import { config } from '../config'
import { materialSnapshot } from '../services/material-snapshot'
import { PrivacyRequestKind, toPrivacyRequest } from './privacy'
import {
  AgentRunInput,
  AgentRunUpdate,
  confirmedFieldsChanged,
  normalizeConfirmedFacts,
  runKey,
  terminalRunStatuses,
  validateRunTransition,
  validateRunUpdate,
} from './harness'

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl
    ? {
        rejectUnauthorized: Boolean(config.database.sslCa),
        ...(config.database.sslCa ? { ca: config.database.sslCa } : {}),
      }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// 生成唯一 ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function toPaymentOrder(row: any) {
  if (!row) return null
  return {
    id: row.id,
    orderNo: row.order_no,
    caseId: row.case_id,
    userId: row.user_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    wechatTransactionId: row.wechat_transaction_id,
    prepayId: row.prepay_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  }
}

function toEntitlement(row: any) {
  if (!row) return null
  return {
    id: row.id,
    caseId: row.case_id,
    userId: row.user_id,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toConversation(row: any) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    caseId: row.case_id,
    status: row.status,
    agentState: row.agent_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toAgentRun(row: any) {
  if (!row) return null
  return {
    id: row.id,
    caseId: row.case_id,
    task: row.task,
    inputRevision: row.input_revision,
    skillVersion: row.skill_version,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    output: row.output || undefined,
    safeErrorCode: row.safe_error_code || undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// 用户操作
export const db = {
  // Users
  async createUser(openid: string) {
    const id = generateId('user')
    const result = await pool.query(
      `INSERT INTO users (id, openid, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING *`,
      [id, openid]
    )
    return result.rows[0]
  },

  async findUserByOpenid(openid: string) {
    const result = await pool.query(
      'SELECT * FROM users WHERE openid = $1',
      [openid]
    )
    return result.rows[0] || null
  },

  async findUserById(userId: string) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    )
    return result.rows[0] || null
  },

  async updateUserProfile(userId: string, updates: { nickname?: string; avatarKey?: string }) {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.nickname !== undefined) {
      values.push(updates.nickname)
      fields.push(`nickname = $${values.length}`)
    }
    if (updates.avatarKey !== undefined) {
      values.push(updates.avatarKey)
      fields.push(`avatar_key = $${values.length}`)
    }
    if (fields.length === 0) return null

    values.push(userId)
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    )
    return result.rows[0] || null
  },

  async updateUser(userId: string, updates: any) {
    const fields = []
    const values = []
    let index = 1

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = $${index}`)
        values.push(value)
        index++
      }
    }

    if (fields.length === 0) return null

    fields.push(`updated_at = NOW()`)
    values.push(userId)

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    )
    return result.rows[0] || null
  },

  // Cases
  async findActiveCase(userId: string) {
    const result = await pool.query(
      'SELECT * FROM cases WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
      [userId]
    )
    if (!result.rows[0]) return null

    // 转换字段名为 camelCase
    const row = result.rows[0]
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      accidentType: row.accident_type,
      accidentDate: row.accident_date,
      status: row.status,
      statusLabel: row.status_label,
      materialCount: row.material_count,
      liability: row.liability,
      compensation: row.compensation,
      hasReport: row.has_report,
      isActive: row.is_active,
      inputRevision: row.input_revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async findCaseById(userId: string, caseId: string) {
    const result = await pool.query(
      'SELECT * FROM cases WHERE id = $1 AND user_id = $2 LIMIT 1',
      [caseId, userId]
    )
    if (!result.rows[0]) return null

    const row = result.rows[0]
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      accidentType: row.accident_type,
      accidentDate: row.accident_date,
      status: row.status,
      statusLabel: row.status_label,
      materialCount: row.material_count,
      liability: row.liability,
      compensation: row.compensation,
      hasReport: row.has_report,
      isActive: row.is_active,
      inputRevision: row.input_revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async createCase(userId: string, title: string) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // 将现有活跃案件设为非活跃
      await client.query(
        'UPDATE cases SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_active = TRUE',
        [userId]
      )
      await client.query(
        `UPDATE payment_orders SET status = 'closed', updated_at = NOW()
         WHERE user_id = $1 AND case_id IN (
           SELECT id FROM cases WHERE user_id = $1 AND is_active = FALSE
         ) AND status IN ('created', 'pending')`,
        [userId]
      )
      await client.query(
        `UPDATE case_entitlements SET status = 'unpaid', updated_at = NOW()
         WHERE user_id = $1 AND status = 'pending'
           AND NOT EXISTS (
             SELECT 1 FROM payment_orders
             WHERE case_entitlements.case_id = payment_orders.case_id
               AND payment_orders.status IN ('created', 'pending')
           )`,
        [userId]
      )

      // 创建新案件
      const id = generateId('case')
      const result = await client.query(
        `INSERT INTO cases (
          id, user_id, title, status, status_label, material_count,
          has_report, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, 'collecting', '材料收集中', 0, FALSE, TRUE, NOW(), NOW())
        RETURNING *`,
        [id, userId, title]
      )

      await client.query('COMMIT')

      // 转换为 camelCase
      const row = result.rows[0]
      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        accidentType: row.accident_type,
        accidentDate: row.accident_date,
        status: row.status,
        statusLabel: row.status_label,
        materialCount: row.material_count,
        liability: row.liability,
        compensation: row.compensation,
        hasReport: row.has_report,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  async updateCase(userId: string, updates: any, caseId?: string) {
    const fields = []
    const values = []
    let index = 1

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
        fields.push(`${snakeKey} = $${index}`)
        values.push(value)
        index++
      }
    }

    if (fields.length === 0) return null

    fields.push(`updated_at = NOW()`)
    const whereClause = caseId ? `id = $${index} AND user_id = $${index + 1}` : `user_id = $${index} AND is_active = TRUE`
    values.push(...(caseId ? [caseId, userId] : [userId]))

    const result = await pool.query(
      `UPDATE cases SET ${fields.join(', ')}
       WHERE ${whereClause}
       RETURNING *`,
      values
    )
    if (!result.rows[0]) return null

    // 转换为 camelCase
    const row = result.rows[0]
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      accidentType: row.accident_type,
      accidentDate: row.accident_date,
      status: row.status,
      statusLabel: row.status_label,
      materialCount: row.material_count,
      liability: row.liability,
      compensation: row.compensation,
      hasReport: row.has_report,
      isActive: row.is_active,
      inputRevision: row.input_revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async getCaseFacts(caseId: string) {
    const result = await pool.query('SELECT * FROM case_facts WHERE case_id = $1 ORDER BY fact_key', [caseId])
    return result.rows.map(row => ({
      id: row.id,
      caseId: row.case_id,
      key: row.fact_key,
      label: row.label,
      value: row.value,
      source: row.source_type === 'material' ? `material:${row.source_id}` : row.source_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      confidence: row.confidence,
      confirmationStatus: row.confirmation_status,
      revision: row.revision,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  },

  async getCaseRevisions(caseId: string) {
    const result = await pool.query('SELECT * FROM case_revisions WHERE case_id = $1 ORDER BY input_revision', [caseId])
    return result.rows.map(row => ({
      id: row.id,
      caseId: row.case_id,
      inputRevision: row.input_revision,
      reasonCode: row.reason_code,
      changedEntityType: row.changed_entity_type || undefined,
      changedEntityId: row.changed_entity_id || undefined,
      createdAt: row.created_at,
    }))
  },

  async persistConfirmedFacts(userId: string, caseId: string, facts: any[], reasonCode = 'conversation_confirmation', changedEntityType = 'conversation', changedEntityId?: string) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const caseResult = await client.query('SELECT id, input_revision FROM cases WHERE id=$1 AND user_id=$2 FOR UPDATE', [caseId, userId])
      const caseRow = caseResult.rows[0]
      if (!caseRow) throw new Error('CASE_NOT_FOUND')
      const normalized = normalizeConfirmedFacts(facts)
      const current = await client.query('SELECT * FROM case_facts WHERE case_id=$1', [caseId])
      const existing = new Map(current.rows.map(row => [row.fact_key, row]))
      const changed = normalized.some(fact => existing.get(fact.key)?.value !== fact.value)
      if (!changed) {
        await client.query('COMMIT')
        return { inputRevision: caseRow.input_revision, changed: false, facts: await this.getCaseFacts(caseId) }
      }
      const inputRevision = caseRow.input_revision + 1
      for (const fact of normalized) {
        const previous = existing.get(fact.key)
        if (previous?.value === fact.value) continue
        await client.query(
          `INSERT INTO case_facts (id,case_id,fact_key,label,value,source_type,source_id,confidence,confirmation_status,revision,confirmed_at,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,NOW(),NOW(),NOW())
           ON CONFLICT (case_id,fact_key) DO UPDATE SET label=EXCLUDED.label,value=EXCLUDED.value,source_type=EXCLUDED.source_type,source_id=EXCLUDED.source_id,confidence=EXCLUDED.confidence,confirmation_status='confirmed',revision=EXCLUDED.revision,confirmed_at=NOW(),updated_at=NOW()`,
          [previous?.id || generateId('fact'), caseId, fact.key, fact.label, fact.value, fact.sourceType, fact.sourceId, fact.confidence || null, inputRevision]
        )
      }
      await client.query('UPDATE cases SET input_revision=$1, has_report=FALSE, updated_at=NOW() WHERE id=$2', [inputRevision, caseId])
      await client.query(
        'INSERT INTO case_revisions (id,case_id,input_revision,reason_code,changed_entity_type,changed_entity_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
        [generateId('revision'), caseId, inputRevision, reasonCode, changedEntityType, changedEntityId || null]
      )
      await client.query('COMMIT')
      return { inputRevision, changed: true, facts: await this.getCaseFacts(caseId) }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  async createAgentRun(input: AgentRunInput) {
    const caseResult = await pool.query('SELECT input_revision FROM cases WHERE id=$1', [input.caseId])
    if (!caseResult.rows[0]) throw new Error('CASE_NOT_FOUND')
    if (caseResult.rows[0].input_revision !== input.inputRevision) throw new Error('STALE_INPUT_REVISION')
    const idempotencyKey = runKey(input)
    const id = generateId('run')
    const result = await pool.query(
      `INSERT INTO agent_runs (id,case_id,task,input_revision,skill_version,idempotency_key,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'queued',NOW(),NOW())
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
      [id, input.caseId, input.task, input.inputRevision, input.skillVersion, idempotencyKey]
    )
    if (result.rows[0]) return { run: toAgentRun(result.rows[0]), created: true }
    const existing = await pool.query('SELECT * FROM agent_runs WHERE idempotency_key=$1', [idempotencyKey])
    return { run: toAgentRun(existing.rows[0]), created: false }
  },

  async getRunEvents(userId: string, caseId: string, runId: string) {
    const owner = await pool.query('SELECT ar.id FROM agent_runs ar JOIN cases c ON c.id=ar.case_id WHERE ar.id=$1 AND ar.case_id=$2 AND c.user_id=$3', [runId, caseId, userId])
    if (!owner.rows[0]) return null
    const events = await pool.query('SELECT status,safe_error_code,created_at FROM run_events WHERE run_id=$1 ORDER BY id', [runId])
    return events.rows.map(row => ({ status: row.status, safeErrorCode: row.safe_error_code || undefined, createdAt: row.created_at }))
  },

  async findLatestReportRun(caseId: string, inputRevision: number) {
    const result = await pool.query("SELECT * FROM agent_runs WHERE case_id=$1 AND task='report' AND input_revision=$2 ORDER BY created_at DESC,id DESC LIMIT 1", [caseId, inputRevision])
    return toAgentRun(result.rows[0])
  },

  async findAgentRun(runId: string) {
    const result = await pool.query('SELECT * FROM agent_runs WHERE id=$1', [runId])
    return toAgentRun(result.rows[0])
  },

  async claimAgentRun(runId: string) {
    const result = await pool.query(
      `UPDATE agent_runs SET status='running',started_at=NOW(),updated_at=NOW()
       WHERE id=$1 AND status='queued' RETURNING *`,
      [runId]
    )
    return toAgentRun(result.rows[0])
  },

  async updateAgentRun(runId: string, update: AgentRunUpdate) {
    validateRunUpdate(update)
    const current = await pool.query('SELECT * FROM agent_runs WHERE id=$1', [runId])
    if (!current.rows[0]) return null
    validateRunTransition(current.rows[0].status, update.status)
    const result = await pool.query(
      `UPDATE agent_runs SET status=$1,output=$2,safe_error_code=$3,
       started_at=CASE WHEN $1='running' THEN COALESCE(started_at,NOW()) ELSE started_at END,
       completed_at=CASE WHEN $1=ANY($4::text[]) THEN NOW() ELSE completed_at END,updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [update.status, update.output ? JSON.stringify(update.output) : null, update.safeErrorCode || null, terminalRunStatuses, runId]
    )
    return toAgentRun(result.rows[0])
  },

  async publishRunReport(runId: string, content: any, input: { userId: string; materialSnapshot: string }) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `SELECT ar.*,c.input_revision AS current_revision,c.user_id AS owner_id FROM agent_runs ar JOIN cases c ON c.id=ar.case_id
         WHERE ar.id=$1 FOR UPDATE OF ar,c`,
        [runId]
      )
      const row = result.rows[0]
      if (!row) throw new Error('AGENT_RUN_NOT_FOUND')
      if (row.owner_id !== input.userId) throw new Error('CASE_NOT_FOUND')
      if (row.status !== 'running') throw new Error('AGENT_RUN_NOT_RUNNING')
      const entitlement = await client.query('SELECT status FROM case_entitlements WHERE case_id=$1 AND user_id=$2 FOR UPDATE', [row.case_id, input.userId])
      if (entitlement.rows[0]?.status !== 'paid') throw new Error('PAYMENT_REQUIRED')
      const inputs = await client.query('SELECT * FROM artifacts WHERE case_id=$1', [row.case_id])
      if (materialSnapshot(inputs.rows) !== input.materialSnapshot) throw new Error('REPORT_STALE')
      if (row.current_revision !== row.input_revision) {
        await client.query("UPDATE agent_runs SET status='stale',safe_error_code='STALE_INPUT_REVISION',completed_at=NOW(),updated_at=NOW() WHERE id=$1", [runId])
        await client.query('COMMIT')
        throw new Error('STALE_INPUT_REVISION_COMMITTED')
      }
      const existing = await client.query('SELECT * FROM reports WHERE agent_run_id=$1', [runId])
      if (existing.rows[0]) {
        await client.query('COMMIT')
        return { id: existing.rows[0].id, caseId: row.case_id, content: existing.rows[0].content, inputRevision: row.input_revision, agentRunId: runId, createdAt: existing.rows[0].created_at }
      }
      const id = generateId('report')
      await client.query('INSERT INTO reports (id,case_id,content,input_revision,agent_run_id,input_snapshot,created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())', [id, row.case_id, JSON.stringify(content), row.input_revision, runId, JSON.stringify({ materialSnapshot: input.materialSnapshot })])
      await client.query("UPDATE agent_runs SET status='succeeded',output=$1,completed_at=NOW(),updated_at=NOW() WHERE id=$2", [JSON.stringify(content), runId])
      await client.query("UPDATE cases SET has_report=TRUE,status='ready',status_label='报告已完成',updated_at=NOW() WHERE id=$1", [row.case_id])
      await client.query('COMMIT')
      return { id, caseId: row.case_id, content, inputRevision: row.input_revision, agentRunId: runId, createdAt: new Date() }
    } catch (error: any) {
      if (error?.message === 'STALE_INPUT_REVISION_COMMITTED') throw new Error('STALE_INPUT_REVISION')
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  async deleteActiveCase(userId: string) {
    const result = await pool.query(
      'UPDATE cases SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    )
    return (result.rowCount || 0) > 0
  },

  async createPrivacyRequest(userId: string, kind: PrivacyRequestKind) {
    const result = await pool.query(
      `INSERT INTO privacy_requests (id, user_id, kind)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, kind) WHERE status IN ('pending', 'processing')
       DO UPDATE SET kind = EXCLUDED.kind
       RETURNING *`,
      [generateId('privacy'), userId, kind]
    )
    return toPrivacyRequest(result.rows[0])
  },

  async getPrivacyRequestsByUser(userId: string) {
    const result = await pool.query(
      'SELECT * FROM privacy_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    )
    return result.rows.map(toPrivacyRequest)
  },

  // Feedback
  async createFeedback(userId: string, content: string) {
    const result = await pool.query(
      `INSERT INTO feedback (id, user_id, content, status, created_at)
       VALUES ($1, $2, $3, 'new', NOW())
       RETURNING *`,
      [generateId('feedback'), userId, content]
    )
    const row = result.rows[0]
    return { id: row.id, userId: row.user_id, content: row.content, status: row.status, createdAt: row.created_at }
  },

  // Conversations
  async findOrCreateConversation(userId: string, caseId?: string) {
    // 查找活跃对话
    const existing = await pool.query(
      `SELECT * FROM conversations
       WHERE user_id = $1 AND status = $2 AND case_id IS NOT DISTINCT FROM $3
       ORDER BY created_at DESC LIMIT 1`,
      [userId, 'active', caseId || null]
    )

    if (existing.rows[0]) {
      const row = existing.rows[0]
      return {
        id: row.id,
        userId: row.user_id,
        caseId: row.case_id,
        status: row.status,
        agentState: row.agent_state,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    }

    // 创建新对话
    const id = generateId('conv')
    const defaultState = {
      stage: 'collecting',
      collectedFacts: [],
      nextQuestion: '您好！我是灵迈事故理赔助手 请问您遇到了什么类型的事故？',
      quickReplies: [
        { label: '交通事故', value: 'traffic_accident' },
        { label: '工伤事故', value: 'work_injury' },
        { label: '意外伤害', value: 'personal_injury' },
      ],
    }

    const result = await pool.query(
      `INSERT INTO conversations (id, user_id, case_id, status, agent_state, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, NOW(), NOW())
       ON CONFLICT (case_id) WHERE status = 'active' AND case_id IS NOT NULL
       DO UPDATE SET updated_at = conversations.updated_at
       RETURNING *`,
      [id, userId, caseId || null, JSON.stringify(defaultState)]
    )

    const row = result.rows[0]
    return {
      id: row.id,
      userId: row.user_id,
      caseId: row.case_id,
      status: row.status,
      agentState: row.agent_state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async updateConversationState(conversationId: string, agentState: any) {
    const result = await pool.query(
      `UPDATE conversations
       SET agent_state = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(agentState), conversationId]
    )
    if (!result.rows[0]) return null

    const row = result.rows[0]
    return {
      id: row.id,
      userId: row.user_id,
      caseId: row.case_id,
      status: row.status,
      agentState: row.agent_state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async processConversationTurn(input: {
    userId: string
    caseId: string
    text: string
    metadata?: any
    advance: (state: any) => Promise<any>
  }) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ownedCase = await client.query(
        'SELECT id FROM cases WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [input.caseId, input.userId]
      )
      if (!ownedCase.rows[0]) throw new Error('CASE_NOT_FOUND')

      const conversationResult = await client.query(
        `SELECT * FROM conversations
         WHERE user_id = $1 AND case_id = $2 AND status = 'active'
         FOR UPDATE`,
        [input.userId, input.caseId]
      )
      let conversation = conversationResult.rows[0]
      if (!conversation) {
        const defaultState = {
          stage: 'collecting',
          collectedFacts: [],
          nextQuestion: '您好！我是灵迈事故理赔助手 请问您遇到了什么类型的事故？',
          quickReplies: [
            { label: '交通事故', value: 'traffic_accident' },
            { label: '工伤事故', value: 'work_injury' },
            { label: '意外伤害', value: 'personal_injury' },
          ],
        }
        const created = await client.query(
          `INSERT INTO conversations (id, user_id, case_id, status, agent_state, created_at, updated_at)
           VALUES ($1, $2, $3, 'active', $4, NOW(), NOW())
           ON CONFLICT (case_id) WHERE status = 'active' AND case_id IS NOT NULL
           DO UPDATE SET updated_at = conversations.updated_at
           RETURNING *`,
          [generateId('conv'), input.userId, input.caseId, JSON.stringify(defaultState)]
        )
        conversation = created.rows[0]
      }

      const agentState = await input.advance(conversation.agent_state || { stage: 'collecting', collectedFacts: [] })
      const assistantText = agentState.nextQuestion || '好的，我已记录'
      const quickReplies = agentState.quickReplies || []
      await client.query(
        `INSERT INTO messages (id, conversation_id, role, kind, text, metadata, created_at)
         VALUES ($1, $2, 'user', 'text', $3, $4, NOW())`,
        [generateId('msg'), conversation.id, input.text || null, input.metadata ? JSON.stringify(input.metadata) : null]
      )
      await client.query(
        `UPDATE conversations SET agent_state = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(agentState), conversation.id]
      )
      await client.query(
        `INSERT INTO messages (id, conversation_id, role, kind, text, metadata, created_at)
         VALUES ($1, $2, 'assistant', 'text', $3, $4, NOW())`,
        [generateId('msg'), conversation.id, assistantText, JSON.stringify({ quickReplies })]
      )
      await client.query('COMMIT')
      return { agentState, assistantText, quickReplies }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // Messages
  async createMessage(
    conversationId: string,
    role: string,
    kind: string,
    text?: string,
    metadata?: any
  ) {
    const id = generateId('msg')
    const result = await pool.query(
      `INSERT INTO messages (id, conversation_id, role, kind, text, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [id, conversationId, role, kind, text || null, metadata ? JSON.stringify(metadata) : null]
    )
    const row = result.rows[0]
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      kind: row.kind,
      text: row.text,
      metadata: row.metadata,
      createdAt: row.created_at,
    }
  },

  async getMessages(conversationId: string) {
    const result = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    )
    return result.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      kind: row.kind,
      text: row.text,
      metadata: row.metadata,
      createdAt: row.created_at,
    }))
  },

  // Artifacts
  async createArtifact(artifact: {
    caseId: string
    name: string
    type: string
    ossUrl: string
    ossKey: string
    fileSize: number
    mimeType?: string
    status: string
    metadata?: any
  }) {
    const id = generateId('artifact')
    const result = await pool.query(
      `INSERT INTO artifacts (
        id, case_id, name, type, oss_url, oss_key,
        file_size, mime_type, status, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [
        id,
        artifact.caseId,
        artifact.name,
        artifact.type,
        artifact.ossUrl,
        artifact.ossKey,
        artifact.fileSize,
        artifact.mimeType || null,
        artifact.status,
        JSON.stringify(artifact.metadata || {}),
      ]
    )
    const row = result.rows[0]
    return {
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      type: row.type,
      ossUrl: row.oss_url,
      ossKey: row.oss_key,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      status: row.status,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async getArtifactsByCase(caseId: string) {
    const result = await pool.query(
      'SELECT * FROM artifacts WHERE case_id = $1 ORDER BY created_at ASC',
      [caseId]
    )
    return result.rows.map(row => ({
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      type: row.type,
      ossUrl: row.oss_url,
      ossKey: row.oss_key,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      status: row.status,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  },

  async findArtifactById(caseId: string, artifactId: string) {
    const result = await pool.query(
      'SELECT * FROM artifacts WHERE case_id = $1 AND id = $2 LIMIT 1',
      [caseId, artifactId]
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      type: row.type,
      ossUrl: row.oss_url,
      ossKey: row.oss_key,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      status: row.status,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async findArtifactByUrl(caseId: string, imageUrl: string) {
    const result = await pool.query(
      'SELECT * FROM artifacts WHERE case_id = $1 AND oss_url = $2 LIMIT 1',
      [caseId, imageUrl]
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      type: row.type,
      ossUrl: row.oss_url,
      ossKey: row.oss_key,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      status: row.status,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async updateArtifact(caseId: string, artifactId: string, updates: { type?: string; status?: string; metadata?: any }, expectedStatuses?: string[]) {
    const result = await pool.query(
      `UPDATE artifacts
       SET type = COALESCE($1, type), status = COALESCE($2, status), metadata = COALESCE($3, metadata), updated_at = NOW()
       WHERE id = $4 AND case_id = $5 AND ($6::text[] IS NULL OR status = ANY($6))
       RETURNING *`,
      [updates.type || null, updates.status || null, updates.metadata ? JSON.stringify(updates.metadata) : null, artifactId, caseId, expectedStatuses || null]
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      type: row.type,
      ossUrl: row.oss_url,
      ossKey: row.oss_key,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      status: row.status,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async confirmArtifact(userId: string, caseId: string, artifactId: string, fields: any[], rawText?: string) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ownedCase = await client.query('SELECT id FROM cases WHERE id = $1 AND user_id = $2 FOR UPDATE', [caseId, userId])
      if (!ownedCase.rows[0]) {
        await client.query('ROLLBACK')
        return null
      }
      const artifactResult = await client.query(
        `SELECT a.* FROM artifacts a
         JOIN cases c ON c.id = a.case_id
         WHERE a.id = $1 AND a.case_id = $2 AND c.user_id = $3 AND a.status = 'processed'
         FOR UPDATE`,
        [artifactId, caseId, userId]
      )
      const artifact = artifactResult.rows[0]
      if (!artifact) {
        await client.query('ROLLBACK')
        return null
      }
      const previous = artifact.metadata || {}
      const changed = confirmedFieldsChanged(previous, fields) || (rawText !== undefined && rawText !== previous.rawText)
      const metadata = { ...previous, fields, rawText: rawText ?? previous.rawText, confirmed: true, confirmedAt: new Date().toISOString() }
      const updatedResult = await client.query(
        'UPDATE artifacts SET metadata = $1, updated_at = NOW() WHERE id = $2 AND case_id = $3 RETURNING *',
        [JSON.stringify(metadata), artifactId, caseId]
      )
      if (changed) {
        await client.query(
          `UPDATE cases SET
             material_count = material_count + $1,
             has_report = FALSE,
             status = 'collecting',
             status_label = '材料已更新，需重新分析',
             input_revision = input_revision + 1,
             updated_at = NOW()
           WHERE id = $2 AND user_id = $3
           RETURNING input_revision`,
          [previous.confirmed ? 0 : 1, caseId, userId]
        )
        const revisionResult = await client.query('SELECT input_revision FROM cases WHERE id=$1', [caseId])
        await client.query(
          'INSERT INTO case_revisions (id,case_id,input_revision,reason_code,changed_entity_type,changed_entity_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
          [generateId('revision'), caseId, revisionResult.rows[0].input_revision, 'material_confirmation', 'artifact', artifactId]
        )
      }
      await client.query('COMMIT')
      const row = updatedResult.rows[0]
      return {
        id: row.id, caseId: row.case_id, name: row.name, type: row.type,
        ossUrl: row.oss_url, ossKey: row.oss_key, fileSize: row.file_size,
        mimeType: row.mime_type, status: row.status, metadata: row.metadata || {},
        createdAt: row.created_at, updatedAt: row.updated_at,
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  async publishReport(userId: string, caseId: string, content: { liability: string; compensation: string }, snapshot: string) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const owned = await client.query('SELECT id FROM cases WHERE id = $1 AND user_id = $2 FOR UPDATE', [caseId, userId])
      if (!owned.rows[0]) throw new Error('CASE_NOT_FOUND')
      const materials = await client.query('SELECT id, type, metadata FROM artifacts WHERE case_id = $1 ORDER BY id', [caseId])
      if (materialSnapshot(materials.rows) !== snapshot) throw new Error('REPORT_STALE')
      await client.query(
        'INSERT INTO reports (id, case_id, content, input_snapshot, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [generateId('report'), caseId, JSON.stringify(content), JSON.stringify({ materialSnapshot: snapshot })]
      )
      await client.query(
        `UPDATE cases SET has_report = TRUE, status = 'ready', status_label = '报告已完成', liability = $1, compensation = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4`,
        [content.liability, content.compensation, caseId, userId]
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // Reports
  async createReport(caseId: string, content: any, options?: {
    modelVersion?: string
    ruleVersion?: string
    inputSnapshot?: any
  }) {
    const id = generateId('report')
    const result = await pool.query(
      `INSERT INTO reports (
        id, case_id, content, model_version, rule_version,
        input_snapshot, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *`,
      [
        id,
        caseId,
        JSON.stringify(content),
        options?.modelVersion || null,
        options?.ruleVersion || null,
        options?.inputSnapshot ? JSON.stringify(options.inputSnapshot) : null,
      ]
    )
    return result.rows[0]
  },

  async getReportByCase(caseId: string) {
    const result = await pool.query(
      'SELECT * FROM reports WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1',
      [caseId]
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      caseId: row.case_id,
      content: row.content,
      inputRevision: row.input_revision ?? undefined,
      agentRunId: row.agent_run_id ?? undefined,
      modelVersion: row.model_version ?? undefined,
      ruleVersion: row.rule_version ?? undefined,
      inputSnapshot: row.input_snapshot ?? undefined,
      createdAt: row.created_at,
    }
  },

  // Entitlements and payment orders
  async getCaseEntitlement(userId: string, caseId: string) {
    const result = await pool.query(
      'SELECT * FROM case_entitlements WHERE case_id = $1 AND user_id = $2 LIMIT 1',
      [caseId, userId]
    )
    return toEntitlement(result.rows[0])
  },

  async getOrCreateCaseEntitlement(userId: string, caseId: string) {
    const caseResult = await pool.query('SELECT id FROM cases WHERE id = $1 AND user_id = $2', [caseId, userId])
    if (!caseResult.rows[0]) throw new Error('CASE_NOT_FOUND')
    const id = generateId('entitlement')
    const result = await pool.query(
      `INSERT INTO case_entitlements (id, case_id, user_id, status, amount_cents, currency, created_at, updated_at)
       VALUES ($1, $2, $3, 'unpaid', $4, $5, NOW(), NOW())
       ON CONFLICT (case_id) DO UPDATE SET case_id = EXCLUDED.case_id
       RETURNING *`,
      [id, caseId, userId, config.payment.amountCents, config.payment.currency]
    )
    const row = result.rows[0]
    if (row.user_id !== userId) throw new Error('CASE_NOT_FOUND')
    return toEntitlement(row)
  },

  async listPaymentOrders(userId: string, limit: number, offset: number) {
    const result = await pool.query(
      'SELECT * FROM payment_orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    )
    return result.rows.map(row => toPaymentOrder(row)!)
  },

  async findPaymentOrderById(userId: string, orderId: string) {
    const result = await pool.query('SELECT * FROM payment_orders WHERE id = $1 AND user_id = $2', [orderId, userId])
    return toPaymentOrder(result.rows[0])
  },

  async findPaymentOrderByOrderNo(orderNo: string) {
    const result = await pool.query('SELECT * FROM payment_orders WHERE order_no = $1', [orderNo])
    return toPaymentOrder(result.rows[0])
  },

  async setPaymentOrderPrepay(orderId: string, prepayId: string) {
    const result = await pool.query(
      `UPDATE payment_orders SET prepay_id = $1, status = 'pending', updated_at = NOW()
       WHERE id = $2 AND status IN ('created', 'pending') RETURNING *`,
      [prepayId, orderId]
    )
    const order = toPaymentOrder(result.rows[0])
    if (!order) throw new Error('ORDER_NOT_FOUND')
    return order
  },

  async findPaymentOrderByIdempotency(userId: string, caseId: string, key: string) {
    const result = await pool.query(
      'SELECT * FROM payment_orders WHERE user_id = $1 AND case_id = $2 AND idempotency_key = $3',
      [userId, caseId, key]
    )
    return toPaymentOrder(result.rows[0])
  },

  async findActivePaymentOrder(userId: string, caseId: string) {
    const result = await pool.query(
      `SELECT * FROM payment_orders
       WHERE user_id = $1 AND case_id = $2 AND status IN ('created', 'pending') AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, caseId]
    )
    return toPaymentOrder(result.rows[0])
  },

  async findPendingPaymentOrder(userId: string, caseId: string) {
    const result = await pool.query(
      `SELECT * FROM payment_orders
       WHERE user_id = $1 AND case_id = $2 AND status IN ('created', 'pending')
       ORDER BY created_at DESC LIMIT 1`,
      [userId, caseId]
    )
    return toPaymentOrder(result.rows[0])
  },

  async updatePaymentOrderStatus(orderId: string, status: 'failed' | 'closed') {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `UPDATE payment_orders SET status = $1, updated_at = NOW()
         WHERE id = $2 AND status IN ('created', 'pending') RETURNING *`,
        [status, orderId]
      )
      if (result.rows[0]) {
        await client.query(
          `UPDATE case_entitlements SET status = 'unpaid', updated_at = NOW()
           WHERE case_id = $1 AND status = 'pending'
             AND NOT EXISTS (
               SELECT 1 FROM payment_orders
               WHERE case_id = $1 AND status IN ('created', 'pending') AND id <> $2
             )`,
          [result.rows[0].case_id, orderId]
        )
      }
      await client.query('COMMIT')
      return toPaymentOrder(result.rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  async createPaymentOrder(input: {
    caseId: string
    userId: string
    amountCents: number
    currency: string
    idempotencyKey?: string
    prepayId?: string | null
  }) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ownedCase = await client.query('SELECT id FROM cases WHERE id = $1 AND user_id = $2 FOR UPDATE', [input.caseId, input.userId])
      if (!ownedCase.rows[0]) throw new Error('CASE_NOT_FOUND')
      const existingEntitlement = await client.query(
        'SELECT status FROM case_entitlements WHERE case_id = $1 AND user_id = $2 FOR UPDATE',
        [input.caseId, input.userId]
      )
      if (existingEntitlement.rows[0]?.status === 'paid') throw new Error('ALREADY_PAID')
      if (input.idempotencyKey) {
        const existing = await client.query(
          'SELECT * FROM payment_orders WHERE user_id = $1 AND case_id = $2 AND idempotency_key = $3',
          [input.userId, input.caseId, input.idempotencyKey]
        )
        if (existing.rows[0]) {
          await client.query('COMMIT')
          return toPaymentOrder(existing.rows[0])
        }
      }
      const active = await client.query(
        `SELECT * FROM payment_orders WHERE user_id = $1 AND case_id = $2
         AND status IN ('created', 'pending')
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [input.userId, input.caseId]
      )
      if (active.rows[0]) {
        await client.query('COMMIT')
        return toPaymentOrder(active.rows[0])
      }
      const nowId = generateId('order')
      const orderNo = `LM${randomBytes(15).toString('hex')}`
      const result = await client.query(
        `INSERT INTO payment_orders (id, order_no, case_id, user_id, amount_cents, currency, status, prepay_id, idempotency_key, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW() + ($10 * INTERVAL '1 minute'))
         RETURNING *`,
        [nowId, orderNo, input.caseId, input.userId, input.amountCents, input.currency, input.prepayId ? 'pending' : 'created', input.prepayId || null, input.idempotencyKey || null, config.payment.orderExpiresMinutes]
      )
      await client.query(
        `INSERT INTO case_entitlements (id, case_id, user_id, status, amount_cents, currency, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4, $5, NOW(), NOW())
         ON CONFLICT (case_id) DO UPDATE SET status = CASE WHEN case_entitlements.status = 'paid' THEN 'paid' ELSE 'pending' END,
           amount_cents = EXCLUDED.amount_cents, currency = EXCLUDED.currency,
           updated_at = NOW()`,
        [generateId('entitlement'), input.caseId, input.userId, input.amountCents, input.currency]
      )
      await client.query('COMMIT')
      return toPaymentOrder(result.rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  async completePaymentOrder(input: {
    orderNo: string
    userId: string
    amountCents: number
    currency: string
    wechatTransactionId: string
  }) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const target = await client.query('SELECT case_id FROM payment_orders WHERE order_no = $1', [input.orderNo])
      if (!target.rows[0]) throw new Error('ORDER_NOT_FOUND')
      await client.query('SELECT id FROM cases WHERE id = $1 AND user_id = $2 FOR UPDATE', [target.rows[0].case_id, input.userId])
      const result = await client.query('SELECT * FROM payment_orders WHERE order_no = $1 FOR UPDATE', [input.orderNo])
      const order = toPaymentOrder(result.rows[0])
      if (!order || order.userId !== input.userId) throw new Error('ORDER_NOT_FOUND')
      if (order.amountCents !== input.amountCents || order.currency !== input.currency) throw new Error('PAYMENT_AMOUNT_MISMATCH')
      if (order.status === 'paid') {
        if (order.wechatTransactionId !== input.wechatTransactionId) throw new Error('TRANSACTION_MISMATCH')
        await client.query('COMMIT')
        return order
      }
      if (order.status === 'refunded' || order.status === 'failed') throw new Error('ORDER_NOT_PAYABLE')
      const duplicate = await client.query(
        'SELECT id FROM payment_orders WHERE wechat_transaction_id = $1 AND id <> $2',
        [input.wechatTransactionId, order.id]
      )
      if (duplicate.rows[0]) throw new Error('TRANSACTION_ALREADY_USED')
      const paidAt = new Date()
      await client.query(
        `UPDATE payment_orders SET status = 'paid', wechat_transaction_id = $1, paid_at = $2, updated_at = NOW() WHERE id = $3`,
        [input.wechatTransactionId, paidAt, order.id]
      )
      await client.query(
        `INSERT INTO case_entitlements (id, case_id, user_id, status, amount_cents, currency, paid_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'paid', $4, $5, $6, NOW(), NOW())
         ON CONFLICT (case_id) DO UPDATE SET status = 'paid', paid_at = EXCLUDED.paid_at, updated_at = NOW()
         WHERE case_entitlements.user_id = EXCLUDED.user_id`,
        [generateId('entitlement'), order.caseId, order.userId, order.amountCents, order.currency, paidAt]
      )
      await client.query('COMMIT')
      return { ...order, status: 'paid', wechatTransactionId: input.wechatTransactionId, paidAt, updatedAt: paidAt }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  async refundPaymentOrder(orderId: string) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const target = await client.query('SELECT case_id FROM payment_orders WHERE id = $1', [orderId])
      if (!target.rows[0]) { await client.query('COMMIT'); return null }
      await client.query('SELECT id FROM cases WHERE id = $1 FOR UPDATE', [target.rows[0].case_id])
      const result = await client.query('UPDATE payment_orders SET status = \'refunded\', updated_at = NOW() WHERE id = $1 AND status = \'paid\' RETURNING *', [orderId])
      if (!result.rows[0]) {
        await client.query('COMMIT')
        return null
      }
      await client.query(
        `UPDATE case_entitlements SET status = 'refunded', updated_at = NOW() WHERE case_id = $1
         AND NOT EXISTS (SELECT 1 FROM payment_orders WHERE case_id = $1 AND status = 'paid')`,
        [result.rows[0].case_id]
      )
      await client.query('COMMIT')
      return toPaymentOrder(result.rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  // Health check
  async ping(): Promise<boolean> {
    try {
      await pool.query('SELECT 1')
      return true
    } catch (err) {
      console.error('PostgreSQL ping failed:', safeError(err))
      return false
    }
  },

  // Graceful shutdown
  async close() {
    await pool.end()
  },
}

export { pool }
