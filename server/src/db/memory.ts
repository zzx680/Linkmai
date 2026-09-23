// 内存存储（MVP 临时方案，生产环境需替换为真实数据库）

import { config } from '../config'

export interface User {
  id: string
  openid: string
  phone?: string
  nickname?: string
  avatar?: string
  createdAt: Date
  updatedAt: Date
}

export interface Case {
  id: string
  userId: string
  title: string
  accidentType?: string
  accidentDate?: Date
  status: string
  statusLabel: string
  materialCount: number
  liability?: string
  compensation?: string
  hasReport: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Conversation {
  id: string
  userId: string
  caseId?: string
  status: string
  agentState?: AgentState // Agent 状态追踪
  createdAt: Date
  updatedAt: Date
}

export interface AgentState {
  stage: 'collecting' | 'confirming' | 'analyzing' | 'ready'
  collectedFacts: CollectedFact[]
  pendingConfirmation?: CollectedFact[]
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

export interface Message {
  id: string
  conversationId: string
  role: string
  kind: string
  text?: string
  metadata?: any
  createdAt: Date
}

export interface Artifact {
  id: string
  caseId: string
  name: string
  type: string
  ossUrl: string
  ossKey: string
  fileSize: number
  mimeType?: string
  status: string
  createdAt: Date
  updatedAt: Date
}

export interface PaymentOrder {
  id: string
  orderNo: string
  caseId: string
  userId: string
  amountCents: number
  currency: string
  status: 'created' | 'pending' | 'paid' | 'failed' | 'closed' | 'refunded'
  wechatTransactionId?: string | null
  prepayId?: string | null
  idempotencyKey?: string | null
  createdAt: Date
  paidAt?: Date | null
  updatedAt: Date
  expiresAt: Date
}

export interface CaseEntitlement {
  id: string
  caseId: string
  userId: string
  status: 'unpaid' | 'pending' | 'paid' | 'refunded'
  amountCents: number
  currency: string
  paidAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

// 内存存储
const users = new Map<string, User>()
const cases = new Map<string, Case>()
const conversations = new Map<string, Conversation>()
const messages = new Map<string, Message>()
const artifacts = new Map<string, Artifact>()
const reports = new Map<string, { id: string; caseId: string; content: any; createdAt: Date }>()
const entitlements = new Map<string, CaseEntitlement>()
const paymentOrders = new Map<string, PaymentOrder>()
const paymentOrderByNo = new Map<string, string>()
const paymentOrderByIdempotency = new Map<string, string>()
const paymentOrderByTransaction = new Map<string, string>()

// 索引
const usersByOpenid = new Map<string, string>() // openid -> userId
const activeCasesByUser = new Map<string, string>() // userId -> caseId
const conversationsByUser = new Map<string, string[]>() // userId -> conversationIds
const messagesByConversation = new Map<string, string[]>() // conversationId -> messageIds

export const memoryDB = {
  // Users
  async createUser(openid: string): Promise<User> {
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const user: User = {
      id,
      openid,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    users.set(id, user)
    usersByOpenid.set(openid, id)
    return user
  },

  async findUserByOpenid(openid: string): Promise<User | null> {
    const userId = usersByOpenid.get(openid)
    return userId ? users.get(userId) || null : null
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const user = users.get(userId)
    if (!user) return null
    Object.assign(user, updates, { updatedAt: new Date() })
    return user
  },

  // Cases
  async findActiveCase(userId: string): Promise<Case | null> {
    const caseId = activeCasesByUser.get(userId)
    return caseId ? cases.get(caseId) || null : null
  },

  async findCaseById(userId: string, caseId: string): Promise<Case | null> {
    const caseData = cases.get(caseId)
    return caseData && caseData.userId === userId ? caseData : null
  },

  async createCase(userId: string, title: string): Promise<Case> {
    // 将现有活跃案件设为非活跃
    const existingCaseId = activeCasesByUser.get(userId)
    if (existingCaseId) {
      const existingCase = cases.get(existingCaseId)
      if (existingCase) {
        existingCase.isActive = false
        existingCase.updatedAt = new Date()
      }
      for (const [id, order] of paymentOrders) {
        if (order.caseId === existingCaseId && ['created', 'pending'].includes(order.status)) {
          order.status = 'closed'
          order.updatedAt = new Date()
        }
      }
    }

    const id = `case_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const newCase: Case = {
      id,
      userId,
      title,
      status: 'collecting',
      statusLabel: '材料收集中',
      materialCount: 0,
      hasReport: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    cases.set(id, newCase)
    activeCasesByUser.set(userId, id)
    return newCase
  },

  async updateCase(userId: string, updates: Partial<Case>): Promise<Case | null> {
    const caseId = activeCasesByUser.get(userId)
    if (!caseId) return null
    const caseData = cases.get(caseId)
    if (!caseData) return null
    Object.assign(caseData, updates, { updatedAt: new Date() })
    return caseData
  },

  async deleteActiveCase(userId: string): Promise<boolean> {
    const caseId = activeCasesByUser.get(userId)
    if (!caseId) return false
    cases.delete(caseId)
    activeCasesByUser.delete(userId)
    return true
  },

  // Conversations
  async findOrCreateConversation(userId: string, caseId?: string): Promise<Conversation> {
    const userConvIds = conversationsByUser.get(userId) || []
    const activeConv = userConvIds
      .map((id) => conversations.get(id))
      .find((c) => c && c.status === 'active')

    if (activeConv) return activeConv

    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const conversation: Conversation = {
      id,
      userId,
      caseId,
      status: 'active',
      agentState: {
        stage: 'collecting',
        collectedFacts: [],
        nextQuestion: '您好！我是灵迈事故理赔助手。请问您遇到了什么类型的事故？',
        quickReplies: [
          { label: '交通事故', value: 'traffic_accident' },
          { label: '工伤事故', value: 'work_injury' },
          { label: '意外伤害', value: 'personal_injury' },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    conversations.set(id, conversation)
    conversationsByUser.set(userId, [...userConvIds, id])
    return conversation
  },

  async updateConversationState(conversationId: string, agentState: AgentState): Promise<Conversation | null> {
    const conversation = conversations.get(conversationId)
    if (!conversation) return null
    conversation.agentState = agentState
    conversation.updatedAt = new Date()
    return conversation
  },

  // Messages
  async createMessage(
    conversationId: string,
    role: string,
    kind: string,
    text?: string,
    metadata?: any
  ): Promise<Message> {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const message: Message = {
      id,
      conversationId,
      role,
      kind,
      text,
      metadata,
      createdAt: new Date(),
    }
    messages.set(id, message)
    const convMsgIds = messagesByConversation.get(conversationId) || []
    messagesByConversation.set(conversationId, [...convMsgIds, id])
    return message
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const msgIds = messagesByConversation.get(conversationId) || []
    return msgIds.map((id) => messages.get(id)).filter((m): m is Message => m !== undefined)
  },

  // Artifacts
  async createArtifact(artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Artifact> {
    const id = `artifact_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const newArtifact: Artifact = {
      ...artifact,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    artifacts.set(id, newArtifact)
    return newArtifact
  },

  // Reports
  async createReport(
    caseId: string,
    content: any,
    options?: { modelVersion?: string; ruleVersion?: string; inputSnapshot?: any }
  ) {
    const report = {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      caseId,
      content,
      ...options,
      createdAt: new Date(),
    }
    reports.set(caseId, report)
    return report
  },

  async getReportByCase(caseId: string) {
    return reports.get(caseId) || null
  },

  // Entitlements and payment orders
  async getCaseEntitlement(userId: string, caseId: string): Promise<CaseEntitlement | null> {
    const caseData = cases.get(caseId)
    if (!caseData || caseData.userId !== userId) return null
    return entitlements.get(caseId) || null
  },

  async getOrCreateCaseEntitlement(userId: string, caseId: string): Promise<CaseEntitlement> {
    const caseData = cases.get(caseId)
    if (!caseData || caseData.userId !== userId) throw new Error('CASE_NOT_FOUND')
    const existing = entitlements.get(caseId)
    if (existing) return existing
    const now = new Date()
    const entitlement: CaseEntitlement = {
      id: `entitlement_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      caseId,
      userId,
      status: 'unpaid',
      amountCents: config.payment.amountCents,
      currency: config.payment.currency,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    }
    entitlements.set(caseId, entitlement)
    return entitlement
  },

  async findPaymentOrderById(userId: string, orderId: string): Promise<PaymentOrder | null> {
    const order = paymentOrders.get(orderId)
    return order && order.userId === userId ? order : null
  },

  async findPaymentOrderByOrderNo(orderNo: string): Promise<PaymentOrder | null> {
    const orderId = paymentOrderByNo.get(orderNo)
    return orderId ? paymentOrders.get(orderId) || null : null
  },

  async setPaymentOrderPrepay(orderId: string, prepayId: string): Promise<PaymentOrder> {
    const order = paymentOrders.get(orderId)
    if (!order) throw new Error('ORDER_NOT_FOUND')
    order.prepayId = prepayId
    order.status = 'pending'
    order.updatedAt = new Date()
    return order
  },

  async findPaymentOrderByIdempotency(userId: string, caseId: string, key: string): Promise<PaymentOrder | null> {
    const orderId = paymentOrderByIdempotency.get(`${userId}:${caseId}:${key}`)
    return orderId ? paymentOrders.get(orderId) || null : null
  },

  async findActivePaymentOrder(userId: string, caseId: string): Promise<PaymentOrder | null> {
    const now = Date.now()
    const order = [...paymentOrders.values()].find((item) =>
      item.userId === userId && item.caseId === caseId &&
      (item.status === 'created' || item.status === 'pending') && item.expiresAt.getTime() > now
    )
    return order || null
  },

  async createPaymentOrder(input: {
    caseId: string
    userId: string
    amountCents: number
    currency: string
    idempotencyKey?: string
    prepayId?: string | null
  }): Promise<PaymentOrder> {
    const caseData = cases.get(input.caseId)
    if (!caseData || caseData.userId !== input.userId) throw new Error('CASE_NOT_FOUND')
    const existing = input.idempotencyKey
      ? await this.findPaymentOrderByIdempotency(input.userId, input.caseId, input.idempotencyKey)
      : null
    if (existing) return existing
    const now = new Date()
    const id = `order_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const order: PaymentOrder = {
      id,
      orderNo: `LM${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      caseId: input.caseId,
      userId: input.userId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: input.prepayId ? 'pending' : 'created',
      prepayId: input.prepayId || null,
      wechatTransactionId: null,
      idempotencyKey: input.idempotencyKey || null,
      createdAt: now,
      paidAt: null,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + config.payment.orderExpiresMinutes * 60 * 1000),
    }
    paymentOrders.set(id, order)
    paymentOrderByNo.set(order.orderNo, id)
    if (input.idempotencyKey) paymentOrderByIdempotency.set(`${input.userId}:${input.caseId}:${input.idempotencyKey}`, id)
    const entitlement = entitlements.get(input.caseId)
    if (entitlement) {
      if (entitlement.status !== 'paid') {
        entitlement.status = 'pending'
        entitlement.amountCents = input.amountCents
        entitlement.currency = input.currency
        entitlement.updatedAt = new Date()
      }
    } else {
      const now = new Date()
      entitlements.set(input.caseId, {
        id: `entitlement_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        caseId: input.caseId,
        userId: input.userId,
        status: 'pending',
        amountCents: input.amountCents,
        currency: input.currency,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      })
    }
    return order
  },

  async completePaymentOrder(input: {
    orderNo: string
    userId: string
    amountCents: number
    currency: string
    wechatTransactionId: string
  }): Promise<PaymentOrder> {
    const orderId = paymentOrderByNo.get(input.orderNo)
    const order = orderId ? paymentOrders.get(orderId) : null
    if (!order || order.userId !== input.userId) throw new Error('ORDER_NOT_FOUND')
    if (order.amountCents !== input.amountCents || order.currency !== input.currency) throw new Error('PAYMENT_AMOUNT_MISMATCH')
    const transactionOrderId = paymentOrderByTransaction.get(input.wechatTransactionId)
    if (transactionOrderId && transactionOrderId !== order.id) throw new Error('TRANSACTION_ALREADY_USED')
    if (order.status === 'paid') {
      if (order.wechatTransactionId !== input.wechatTransactionId) throw new Error('TRANSACTION_MISMATCH')
      return order
    }
    if (order.status === 'refunded' || order.status === 'failed') throw new Error('ORDER_NOT_PAYABLE')
    order.status = 'paid'
    order.wechatTransactionId = input.wechatTransactionId
    order.paidAt = new Date()
    order.updatedAt = new Date()
    paymentOrderByTransaction.set(input.wechatTransactionId, order.id)
    const entitlement = entitlements.get(order.caseId) || await this.getOrCreateCaseEntitlement(order.userId, order.caseId)
    entitlement.status = 'paid'
    entitlement.paidAt = order.paidAt
    entitlement.updatedAt = new Date()
    return order
  },

  async refundPaymentOrder(orderId: string): Promise<PaymentOrder | null> {
    const order = paymentOrders.get(orderId)
    if (!order) return null
    order.status = 'refunded'
    order.updatedAt = new Date()
    const entitlement = entitlements.get(order.caseId)
    if (entitlement) {
      entitlement.status = 'refunded'
      entitlement.updatedAt = new Date()
    }
    return order
  },

  // Health check
  async ping(): Promise<boolean> {
    return true
  },
}
