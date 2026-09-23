import { Pool, PoolClient } from 'pg'
import { config } from '../config'

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
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

  async updateCase(userId: string, updates: any) {
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
    values.push(userId)

    const result = await pool.query(
      `UPDATE cases SET ${fields.join(', ')}
       WHERE user_id = $${index} AND is_active = TRUE
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  async deleteActiveCase(userId: string) {
    const result = await pool.query(
      'DELETE FROM cases WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    )
    return (result.rowCount || 0) > 0
  },

  // Conversations
  async findOrCreateConversation(userId: string, caseId?: string) {
    // 查找活跃对话
    const existing = await pool.query(
      'SELECT * FROM conversations WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [userId, 'active']
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
      nextQuestion: '您好！我是灵迈事故理赔助手。请问您遇到了什么类型的事故？',
      quickReplies: [
        { label: '交通事故', value: 'traffic_accident' },
        { label: '工伤事故', value: 'work_injury' },
        { label: '意外伤害', value: 'personal_injury' },
      ],
    }

    const result = await pool.query(
      `INSERT INTO conversations (id, user_id, case_id, status, agent_state, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, NOW(), NOW())
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
  }) {
    const id = generateId('artifact')
    const result = await pool.query(
      `INSERT INTO artifacts (
        id, case_id, name, type, oss_url, oss_key,
        file_size, mime_type, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
    return result.rows[0] || null
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
      await client.query('SELECT id FROM cases WHERE id = $1 AND user_id = $2 FOR UPDATE', [input.caseId, input.userId])
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
         AND status IN ('created', 'pending') AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [input.userId, input.caseId]
      )
      if (active.rows[0]) {
        await client.query('COMMIT')
        return toPaymentOrder(active.rows[0])
      }
      const expired = await client.query(
        `UPDATE payment_orders SET status = 'closed', updated_at = NOW()
         WHERE user_id = $1 AND case_id = $2 AND status IN ('created', 'pending') AND expires_at <= NOW()`,
        [input.userId, input.caseId]
      )
      void expired
      const nowId = generateId('order')
      const orderNo = `LM${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
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
      const result = await client.query('UPDATE payment_orders SET status = \'refunded\', updated_at = NOW() WHERE id = $1 RETURNING *', [orderId])
      if (!result.rows[0]) {
        await client.query('COMMIT')
        return null
      }
      await client.query("UPDATE case_entitlements SET status = 'refunded', updated_at = NOW() WHERE case_id = $1", [result.rows[0].case_id])
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
      console.error('PostgreSQL ping failed:', err)
      return false
    }
  },

  // Graceful shutdown
  async close() {
    await pool.end()
  },
}

export { pool }
