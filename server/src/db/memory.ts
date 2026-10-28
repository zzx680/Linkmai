// 内存存储（MVP 临时方案，生产环境需替换为真实数据库）

import { config } from '../config'
import { randomBytes } from 'crypto'
import { materialSnapshot } from '../services/material-snapshot'
import { PrivacyRequest, PrivacyRequestKind } from './privacy'
import type { ReportNotificationSubscription } from './index'
import { LegalDocument, LegalReference, LegalSearchInput, LegalSection } from '../legal/types'
import { rankLegalReferences } from '../services/legal-retrieval'
import {
  AgentRun,
  AgentRunInput,
  AgentRunUpdate,
  CaseFact,
  CaseRevision,
  ConfirmedCaseFactInput,
  confirmedFieldsChanged,
  normalizeConfirmedFacts,
  runKey,
  terminalRunStatuses,
  validateRunTransition,
  validateRunUpdate,
} from './harness'

export interface User {
  id: string
  openid: string
  phone?: string
  nickname?: string
  avatar?: string
  avatarKey?: string
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
  inputRevision: number
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
  metadata?: {
    fields?: Array<{ key: string; label: string; value: string; confidence?: string }>
    rawText?: string
    confirmed?: boolean
    confirmedAt?: string
    error?: string
    failedAt?: string
  }
  createdAt: Date
  updatedAt: Date
}

export interface Feedback {
  id: string
  userId: string
  content: string
  status: 'new' | 'reviewed' | 'resolved'
  createdAt: Date
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
const feedbacks = new Map<string, Feedback>()
const privacyRequests = new Map<string, PrivacyRequest>()
const reports = new Map<string, { id: string; caseId: string; content: any; inputRevision?: number; agentRunId?: string; inputSnapshot?: { materialSnapshot: string }; createdAt: Date }>()
const reportNotificationSubscriptions = new Map<string, ReportNotificationSubscription>()
const caseFacts = new Map<string, Map<string, CaseFact>>()
const caseRevisions = new Map<string, CaseRevision[]>()
const agentRuns = new Map<string, AgentRun>()
const agentRunIdsByKey = new Map<string, string>()
const runEvents = new Map<string, Array<{ status: AgentRun['status']; safeErrorCode?: string; createdAt: Date }>>()
const legalDocuments = new Map<string, LegalDocument>()
const legalSections = new Map<string, LegalSection>()
function recordRunEvent(run: AgentRun): void {
  const events = runEvents.get(run.id) || []
  if (events[events.length - 1]?.status === run.status) return
  events.push({ status: run.status, safeErrorCode: run.safeErrorCode, createdAt: new Date() })
  runEvents.set(run.id, events)
}
const runLocks = new Map<string, Promise<unknown>>()
async function withRunLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
  const previous = runLocks.get(runId) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  runLocks.set(runId, current)
  await previous
  try { return await operation() } finally {
    release()
    if (runLocks.get(runId) === current) runLocks.delete(runId)
  }
}
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
const conversationLocks = new Map<string, Promise<void>>()

async function withConversationLock<T>(caseId: string, operation: () => Promise<T>): Promise<T> {
  const previous = conversationLocks.get(caseId) || Promise.resolve()
  let release: () => void = () => undefined
  const current = new Promise<void>(resolve => { release = resolve })
  const chained = previous.then(() => current)
  conversationLocks.set(caseId, chained)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (conversationLocks.get(caseId) === chained) conversationLocks.delete(caseId)
  }
}

export const memoryDB = {
  async createReportNotificationSubscription(userId: string, caseId: string, templateId: string) {
    const currentCase = cases.get(caseId)
    if (!currentCase || currentCase.userId !== userId) throw new Error('CASE_NOT_FOUND')
    const now = new Date()
    for (const [id, item] of reportNotificationSubscriptions) {
      if (item.status === 'awaiting_run' && item.expiresAt && item.expiresAt <= now) reportNotificationSubscriptions.delete(id)
    }
    const subscription: ReportNotificationSubscription = {
      id: `report_notice_${Date.now()}_${randomBytes(12).toString('hex')}`,
      userId, caseId, templateId, status: 'awaiting_run',
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), createdAt: now,
    }
    reportNotificationSubscriptions.set(subscription.id, subscription)
    return structuredClone(subscription)
  },

  async linkReportNotificationSubscription(id: string, userId: string, caseId: string, runId: string) {
    const subscription = reportNotificationSubscriptions.get(id)
    if (!subscription || subscription.userId !== userId || subscription.caseId !== caseId) return false
    if (subscription.status === 'pending' && subscription.runId === runId) return true
    if (subscription.status !== 'awaiting_run' || !subscription.expiresAt || subscription.expiresAt <= new Date()) return false
    subscription.runId = runId
    subscription.status = 'pending'
    subscription.expiresAt = null
    return true
  },

  async claimReportNotificationSubscription(runId: string) {
    const subscription = [...reportNotificationSubscriptions.values()].find(item => item.runId === runId && item.status === 'pending')
    if (!subscription) return null
    subscription.status = 'sending'
    return structuredClone(subscription)
  },

  async finishReportNotificationSubscription(id: string, status: 'sent' | 'failed', errorCode?: string) {
    const subscription = reportNotificationSubscriptions.get(id)
    if (!subscription || subscription.status !== 'sending') return null
    subscription.status = status
    subscription.errorCode = errorCode || null
    if (status === 'sent') subscription.sentAt = new Date()
    return structuredClone(subscription)
  },

  async syncHarnessReportState(userId: string, caseId: string, ready: boolean) {
    const item = cases.get(caseId)
    if (!item || item.userId !== userId) throw new Error('CASE_NOT_FOUND')
    item.hasReport = ready
    if (ready) { item.status = 'ready'; item.statusLabel = '报告已复核' }
    else if (item.status === 'ready') { item.status = 'collecting'; item.statusLabel = '等待核对与复核' }
  },
  // Atomic memory counterpart of the case-row transaction used by the new Harness.
  async advanceHarnessRevision(userId: string, caseId: string, expected: number, next: number) {
    const item = cases.get(caseId)
    if (!item || item.userId !== userId) throw new Error('CASE_NOT_FOUND')
    if (item.inputRevision !== expected || next <= expected) throw new Error('INPUT_STALE')
    item.inputRevision = next
    item.hasReport = false
    item.status = 'collecting'
    item.statusLabel = '案件信息已更新'
    item.updatedAt = new Date()
    caseRevisions.set(caseId, [...(caseRevisions.get(caseId) || []), {
      id: `revision_${randomBytes(16).toString('hex')}`, caseId, inputRevision: next,
      reasonCode: 'harness_input_change', createdAt: new Date(),
    }])
  },
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

  async findUserById(userId: string): Promise<User | null> {
    return users.get(userId) || null
  },

  async updateUserProfile(userId: string, updates: { nickname?: string; avatarKey?: string }): Promise<User | null> {
    const user = users.get(userId)
    if (!user) return null
    if (updates.nickname !== undefined) user.nickname = updates.nickname
    if (updates.avatarKey !== undefined) user.avatarKey = updates.avatarKey
    user.updatedAt = new Date()
    return user
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
      for (const [, order] of paymentOrders) {
        if (order.caseId === existingCaseId && ['created', 'pending'].includes(order.status)) {
          order.status = 'closed'
          order.updatedAt = new Date()
        }
      }
      const entitlement = entitlements.get(existingCaseId)
      if (entitlement?.status === 'pending') {
        entitlement.status = 'unpaid'
        entitlement.updatedAt = new Date()
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
      inputRevision: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    cases.set(id, newCase)
    activeCasesByUser.set(userId, id)
    return newCase
  },

  async updateCase(userId: string, updates: Partial<Case>, caseId?: string): Promise<Case | null> {
    const targetCaseId = caseId || activeCasesByUser.get(userId)
    if (!targetCaseId) return null
    const caseData = cases.get(targetCaseId)
    if (!caseData || caseData.userId !== userId) return null
    const updatedCase = { ...caseData, ...updates, updatedAt: new Date() }
    cases.set(targetCaseId, updatedCase)
    return updatedCase
  },

  async deleteActiveCase(userId: string): Promise<boolean> {
    const caseId = activeCasesByUser.get(userId)
    if (!caseId) return false
    const caseData = cases.get(caseId)
    if (caseData) {
      caseData.isActive = false
      caseData.updatedAt = new Date()
    }
    activeCasesByUser.delete(userId)
    return true
  },

  async createPrivacyRequest(userId: string, kind: PrivacyRequestKind): Promise<PrivacyRequest> {
    if (!users.has(userId)) throw new Error('USER_NOT_FOUND')
    const existing = [...privacyRequests.values()].find(item => item.userId === userId
      && item.kind === kind && ['pending', 'processing'].includes(item.status))
    if (existing) return existing
    const now = new Date()
    const item: PrivacyRequest = {
      id: `privacy_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId, kind, status: 'pending', response: null, createdAt: now, updatedAt: now,
    }
    privacyRequests.set(item.id, item)
    return item
  },

  async getPrivacyRequestsByUser(userId: string): Promise<PrivacyRequest[]> {
    return [...privacyRequests.values()].filter(item => item.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20)
  },

  // Feedback
  async createFeedback(userId: string, content: string): Promise<Feedback> {
    if (!users.has(userId)) throw new Error('USER_NOT_FOUND')
    const feedback: Feedback = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      content,
      status: 'new',
      createdAt: new Date(),
    }
    feedbacks.set(feedback.id, feedback)
    return feedback
  },

  async getFeedbackByUser(userId: string): Promise<Feedback[]> {
    return [...feedbacks.values()]
      .filter(feedback => feedback.userId === userId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
  },

  async getCaseFacts(caseId: string): Promise<CaseFact[]> {
    return [...(caseFacts.get(caseId)?.values() || [])].sort((a, b) => a.key.localeCompare(b.key))
  },

  async getCaseRevisions(caseId: string): Promise<CaseRevision[]> {
    return [...(caseRevisions.get(caseId) || [])]
  },

  async persistConfirmedFacts(
    userId: string,
    caseId: string,
    facts: ConfirmedCaseFactInput[],
    reasonCode = 'conversation_confirmation',
    changedEntityType = 'conversation',
    changedEntityId?: string
  ): Promise<{ inputRevision: number; changed: boolean; facts: CaseFact[] }> {
    const currentCase = cases.get(caseId)
    if (!currentCase || currentCase.userId !== userId) throw new Error('CASE_NOT_FOUND')
    const normalized = normalizeConfirmedFacts(facts)
    const existing = caseFacts.get(caseId) || new Map<string, CaseFact>()
    const changed = normalized.some(fact => {
      const previous = existing.get(fact.key)
      return !previous || previous.value !== fact.value
    })
    if (!changed) return { inputRevision: currentCase.inputRevision, changed: false, facts: [...existing.values()] }

    currentCase.inputRevision += 1
    currentCase.hasReport = false
    currentCase.status = 'collecting'
    currentCase.statusLabel = '案件信息已更新，需重新分析'
    currentCase.updatedAt = new Date()
    const now = new Date()
    for (const fact of normalized) {
      const previous = existing.get(fact.key)
      if (previous?.value === fact.value) continue
      existing.set(fact.key, {
        ...fact,
        id: previous?.id || `fact_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        caseId,
        confirmationStatus: 'confirmed',
        revision: currentCase.inputRevision,
        confirmedAt: now,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      })
    }
    caseFacts.set(caseId, existing)
    const revision: CaseRevision = {
      id: `revision_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      caseId,
      inputRevision: currentCase.inputRevision,
      reasonCode,
      changedEntityType,
      changedEntityId,
      createdAt: now,
    }
    caseRevisions.set(caseId, [...(caseRevisions.get(caseId) || []), revision])
    return { inputRevision: currentCase.inputRevision, changed: true, facts: [...existing.values()] }
  },

  async createAgentRun(input: AgentRunInput): Promise<{ run: AgentRun; created: boolean }> {
    const currentCase = cases.get(input.caseId)
    if (!currentCase) throw new Error('CASE_NOT_FOUND')
    if (input.inputRevision !== currentCase.inputRevision) throw new Error('STALE_INPUT_REVISION')
    const key = runKey(input)
    const existingId = agentRunIdsByKey.get(key)
    if (existingId) return { run: agentRuns.get(existingId)!, created: false }
    const now = new Date()
    const run: AgentRun = {
      ...input,
      id: `run_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      idempotencyKey: key,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    }
    agentRuns.set(run.id, run)
    agentRunIdsByKey.set(key, run.id)
    recordRunEvent(run)
    return { run, created: true }
  },

  async getRunEvents(userId: string, caseId: string, runId: string) {
    const currentCase = cases.get(caseId)
    const run = agentRuns.get(runId)
    if (!currentCase || currentCase.userId !== userId || run?.caseId !== caseId) return null
    return (runEvents.get(runId) || []).map(event => ({ ...event }))
  },

  async findLatestReportRun(caseId: string, inputRevision: number): Promise<AgentRun | null> {
    return [...agentRuns.values()].filter(run => run.caseId === caseId && run.task === 'report' && run.inputRevision === inputRevision)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null
  },

  async findAgentRun(runId: string): Promise<AgentRun | null> {
    return agentRuns.get(runId) || null
  },

  async claimAgentRun(runId: string): Promise<AgentRun | null> {
    return withRunLock(runId, async () => {
      const run = agentRuns.get(runId)
      if (!run || !['queued', 'failed'].includes(run.status)) return null
      run.status = 'running'
      run.output = undefined
      run.safeErrorCode = undefined
      run.completedAt = null
      run.startedAt = new Date()
      run.updatedAt = run.startedAt
      recordRunEvent(run)
      return run
    })
  },

  async updateAgentRun(runId: string, update: AgentRunUpdate): Promise<AgentRun | null> {
    return withRunLock(runId, async () => {
      validateRunUpdate(update)
      const run = agentRuns.get(runId)
      if (!run) return null
      validateRunTransition(run.status, update.status)
      const now = new Date()
      run.status = update.status
      run.output = update.output
      run.safeErrorCode = update.safeErrorCode
      if (update.status === 'running') run.startedAt = run.startedAt || now
      if (terminalRunStatuses.includes(update.status)) run.completedAt = now
      run.updatedAt = now
      recordRunEvent(run)
      return run
    })
  },

  async publishRunReport(runId: string, content: any, input: { userId: string; materialSnapshot: string }) {
    return withRunLock(runId, async () => {
      const run = agentRuns.get(runId)
    if (!run) throw new Error('AGENT_RUN_NOT_FOUND')
    if (run.status !== 'running') throw new Error('AGENT_RUN_NOT_RUNNING')
    const currentCase = cases.get(run.caseId)
    if (!currentCase || currentCase.userId !== input.userId) throw new Error('CASE_NOT_FOUND')
    const entitlement = entitlements.get(run.caseId)
    if (entitlement?.status !== 'paid') throw new Error('PAYMENT_REQUIRED')
    const inputs = [...artifacts.values()].filter(item => item.caseId === run.caseId)
    if (materialSnapshot(inputs) !== input.materialSnapshot) throw new Error('REPORT_STALE')
    if (currentCase.inputRevision !== run.inputRevision) {
      run.status = 'stale'
      run.safeErrorCode = 'STALE_INPUT_REVISION'
      run.completedAt = new Date()
      run.updatedAt = run.completedAt
      recordRunEvent(run)
      throw new Error('STALE_INPUT_REVISION')
    }
    const existing = [...reports.values()].find(report => report.agentRunId === runId)
    if (existing) return existing
    const report = {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      caseId: run.caseId,
      content,
      inputRevision: run.inputRevision,
      agentRunId: run.id,
      inputSnapshot: { materialSnapshot: input.materialSnapshot },
      createdAt: new Date(),
    }
    reports.set(run.caseId, report)
    run.status = 'succeeded'
    run.output = content
    run.completedAt = report.createdAt
    run.updatedAt = report.createdAt
    recordRunEvent(run)
    currentCase.hasReport = true
    currentCase.status = 'ready'
    currentCase.statusLabel = '报告已完成'
      currentCase.updatedAt = report.createdAt
      return report
    })
  },

  // Conversations
  async findOrCreateConversation(userId: string, caseId?: string): Promise<Conversation> {
    const userConvIds = conversationsByUser.get(userId) || []
    const activeConv = userConvIds
      .map((id) => conversations.get(id))
      .find((conversation) =>
        conversation?.status === 'active' && conversation.caseId === caseId
      )

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
        nextQuestion: '您好！我是灵迈事故理赔助手 请问您遇到了什么类型的事故？',
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

  async processConversationTurn(input: {
    userId: string
    caseId: string
    text: string
    metadata?: any
    advance: (state: AgentState) => Promise<AgentState>
  }) {
    return withConversationLock(input.caseId, async () => {
      const conversation = await this.findOrCreateConversation(input.userId, input.caseId)
      const agentState = await input.advance(conversation.agentState || {
        stage: 'collecting', collectedFacts: [],
      })
      await this.createMessage(conversation.id, 'user', 'text', input.text, input.metadata)
      await this.updateConversationState(conversation.id, agentState)
      const assistantText = agentState.nextQuestion || '好的，我已记录'
      const quickReplies = agentState.quickReplies || []
      await this.createMessage(conversation.id, 'assistant', 'text', assistantText, { quickReplies })
      return { agentState, assistantText, quickReplies }
    })
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

  async getArtifactsByCase(caseId: string): Promise<Artifact[]> {
    return [...artifacts.values()]
      .filter(artifact => artifact.caseId === caseId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  },

  async findArtifactById(caseId: string, artifactId: string): Promise<Artifact | null> {
    const artifact = artifacts.get(artifactId)
    return artifact?.caseId === caseId ? artifact : null
  },

  async findArtifactByUrl(caseId: string, imageUrl: string): Promise<Artifact | null> {
    return [...artifacts.values()].find(artifact =>
      artifact.caseId === caseId && artifact.ossUrl === imageUrl
    ) || null
  },

  async updateArtifact(
    caseId: string,
    artifactId: string,
    updates: Partial<Pick<Artifact, 'type' | 'status' | 'metadata'>>,
    expectedStatuses?: string[]
  ): Promise<Artifact | null> {
    const artifact = artifacts.get(artifactId)
    if (!artifact || artifact.caseId !== caseId || (expectedStatuses && !expectedStatuses.includes(artifact.status))) return null
    const updatedArtifact = { ...artifact, ...updates, updatedAt: new Date() }
    artifacts.set(artifactId, updatedArtifact)
    return updatedArtifact
  },

  async confirmArtifact(userId: string, caseId: string, artifactId: string, fields: NonNullable<Artifact['metadata']>['fields'], rawText?: string) {
    const caseData = cases.get(caseId)
    const artifact = artifacts.get(artifactId)
    if (!caseData || caseData.userId !== userId || !artifact || artifact.caseId !== caseId || artifact.status !== 'processed') return null
    const metadata = { ...artifact.metadata, fields, rawText: rawText ?? artifact.metadata?.rawText, confirmed: true, confirmedAt: new Date().toISOString() }
    const changed = confirmedFieldsChanged(artifact.metadata, fields)
      || (rawText !== undefined && rawText !== artifact.metadata?.rawText)
    const updated = { ...artifact, metadata, updatedAt: new Date() }
    artifacts.set(artifactId, updated)
    if (changed) {
      cases.set(caseId, {
        ...caseData,
        materialCount: caseData.materialCount + (artifact.metadata?.confirmed ? 0 : 1),
        hasReport: false,
        status: 'collecting',
        statusLabel: '材料已更新，需重新分析',
        inputRevision: caseData.inputRevision + 1,
        updatedAt: new Date(),
      })
      caseRevisions.set(caseId, [...(caseRevisions.get(caseId) || []), {
        id: `revision_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        caseId,
        inputRevision: caseData.inputRevision + 1,
        reasonCode: 'material_confirmation',
        changedEntityType: 'artifact',
        changedEntityId: artifactId,
        createdAt: new Date(),
      }])
    }
    return updated
  },

  async publishReport(userId: string, caseId: string, content: { liability: string; compensation: string }, snapshot: string) {
    const caseData = cases.get(caseId)
    if (!caseData || caseData.userId !== userId) throw new Error('CASE_NOT_FOUND')
    const inputs = [...artifacts.values()].filter(item => item.caseId === caseId)
    if (materialSnapshot(inputs) !== snapshot) throw new Error('REPORT_STALE')
    const report = {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      caseId, content, inputSnapshot: { materialSnapshot: snapshot }, createdAt: new Date(),
    }
    reports.set(caseId, report)
    cases.set(caseId, { ...caseData, hasReport: true, status: 'ready', statusLabel: '报告已完成', liability: content.liability, compensation: content.compensation, updatedAt: new Date() })
  },

  async upsertLegalCorpus(documents: LegalDocument[], sections: LegalSection[], options?: { insertOnly?: boolean }): Promise<void> {
    for (const document of documents) if (!options?.insertOnly || !legalDocuments.has(document.id)) legalDocuments.set(document.id, { ...document })
    for (const section of sections) {
      if (!legalDocuments.has(section.documentId)) throw new Error('LEGAL_DOCUMENT_NOT_FOUND')
      if (!options?.insertOnly || !legalSections.has(section.legalRefId)) legalSections.set(section.legalRefId, { ...section, keywords: [...section.keywords] })
    }
  },

  async updateLegalPolicy(documentId: string, approved: boolean, active: boolean) {
    const document = legalDocuments.get(documentId)
    if (!document) throw new Error('LEGAL_DOCUMENT_NOT_FOUND')
    document.reviewStatus = approved ? 'approved' : 'rejected'
    document.status = active ? 'active' : 'repealed'
  },

  async searchLegalReferences(input: LegalSearchInput): Promise<LegalReference[]> {
    const references = [...legalSections.values()].flatMap(section => {
      const document = legalDocuments.get(section.documentId)
      return document ? [{ ...document, ...section, keywords: [...section.keywords], score: 0 }] : []
    })
    return rankLegalReferences(references, input)
  },

  async getLegalReferences(legalRefIds: string[]): Promise<LegalReference[]> {
    return legalRefIds.flatMap(legalRefId => {
      const section = legalSections.get(legalRefId)
      const document = section && legalDocuments.get(section.documentId)
      return section && document ? [{ ...document, ...section, keywords: [...section.keywords], score: 0 }] : []
    })
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

  async syncPendingEntitlementAmount(userId: string, caseId: string, amountCents: number, currency: string): Promise<void> {
    const entitlement = entitlements.get(caseId)
    if (!entitlement || entitlement.userId !== userId || !['unpaid', 'pending'].includes(entitlement.status)) return
    entitlement.status = 'pending'
    entitlement.amountCents = amountCents
    entitlement.currency = currency
    entitlement.updatedAt = new Date()
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

  async listPaymentOrders(userId: string, limit: number, offset: number): Promise<PaymentOrder[]> {
    return [...paymentOrders.values()]
      .filter(order => order.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(offset, offset + limit)
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
    if (!order || !['created', 'pending'].includes(order.status)) throw new Error('ORDER_NOT_FOUND')
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

  async findPendingPaymentOrder(userId: string, caseId: string): Promise<PaymentOrder | null> {
    const orders = [...paymentOrders.values()]
      .filter((item) => item.userId === userId && item.caseId === caseId && ['created', 'pending'].includes(item.status))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    return orders[0] || null
  },

  async updatePaymentOrderStatus(orderId: string, status: 'failed' | 'closed'): Promise<PaymentOrder | null> {
    const order = paymentOrders.get(orderId)
    if (!order || order.status === 'paid' || order.status === 'refunded') return order || null
    order.status = status
    order.updatedAt = new Date()
    const entitlement = entitlements.get(order.caseId)
    const hasOtherActiveOrder = [...paymentOrders.values()].some(other =>
      other.id !== order.id && other.caseId === order.caseId && ['created', 'pending'].includes(other.status)
    )
    if (entitlement && entitlement.status === 'pending' && !hasOtherActiveOrder) {
      entitlement.status = 'unpaid'
      entitlement.updatedAt = new Date()
    }
    return order
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
    if (entitlements.get(input.caseId)?.status === 'paid') throw new Error('ALREADY_PAID')
    const existingId = input.idempotencyKey ? paymentOrderByIdempotency.get(`${input.userId}:${input.caseId}:${input.idempotencyKey}`) : null
    const existing = existingId ? paymentOrders.get(existingId) : null
    if (existing) return existing
    const pending = [...paymentOrders.values()].find(item => item.userId === input.userId
      && item.caseId === input.caseId && ['created', 'pending'].includes(item.status))
    if (pending) return pending
    const now = new Date()
    const id = `order_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const order: PaymentOrder = {
      id,
      orderNo: `LM${randomBytes(15).toString('hex')}`,
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
    if (order.status !== 'paid') return order
    order.status = 'refunded'
    order.updatedAt = new Date()
    const entitlement = entitlements.get(order.caseId)
    if (entitlement && ![...paymentOrders.values()].some(item => item.caseId === order.caseId && item.status === 'paid')) {
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
