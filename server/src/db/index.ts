// 数据库抽象层：统一内存数据库和 PostgreSQL 接口
import { config } from '../config'
import { memoryDB } from './memory'
import { db as postgresDB } from './postgres'
export type { LegalCitation, LegalDocument, LegalReference, LegalSearchInput, LegalSection } from '../legal/types'

if (config.database.type !== 'memory' && config.database.type !== 'postgres') {
  throw new Error(`不支持的数据库类型: ${config.database.type}`)
}

export const db = config.database.type === 'postgres' ? postgresDB : memoryDB

// 导出类型定义供其他模块使用
export interface User {
  id: string
  openid: string
  phone?: string
  nickname?: string
  avatar?: string
  avatar_key?: string
  avatarKey?: string
  created_at: Date
  updated_at: Date
}

export type AgentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale' | 'cancelled'

export interface CaseFact {
  id: string
  caseId: string
  key: string
  label: string
  value: string
  source: string
  sourceType: string
  sourceId: string
  confidence?: string
  confirmationStatus: 'confirmed'
  revision: number
  confirmedAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface ConfirmedCaseFactInput {
  key: string
  label: string
  value: string
  source: string
  sourceType?: string
  sourceId?: string
  confidence?: string
}

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

export interface CaseRevision {
  id: string
  caseId: string
  inputRevision: number
  reasonCode: string
  changedEntityType?: string
  changedEntityId?: string
  createdAt: Date
}

export interface Case {
  id: string
  user_id: string
  title: string
  accident_type?: string
  accident_date?: Date
  status: string
  status_label: string
  material_count: number
  liability?: string
  compensation?: string
  has_report: boolean
  is_active: boolean
  input_revision?: number
  created_at: Date
  updated_at: Date
}

export interface Conversation {
  id: string
  user_id: string
  case_id?: string
  status: string
  agent_state?: any
  created_at: Date
  updated_at: Date
}

export interface Message {
  id: string
  conversation_id: string
  role: string
  kind: string
  text?: string
  metadata?: any
  created_at: Date
}

export interface Artifact {
  id: string
  case_id: string
  name: string
  type: string
  oss_url: string
  oss_key: string
  file_size: number
  mime_type?: string
  status: string
  created_at: Date
  updated_at: Date
}

export type EntitlementStatus = 'unpaid' | 'pending' | 'paid' | 'refunded'
export type PaymentOrderStatus = 'created' | 'pending' | 'paid' | 'failed' | 'closed' | 'refunded'

export interface CaseEntitlement {
  id: string
  caseId: string
  userId: string
  status: EntitlementStatus
  amountCents: number
  currency: string
  paidAt?: Date | null
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
  status: PaymentOrderStatus
  wechatTransactionId?: string | null
  prepayId?: string | null
  idempotencyKey?: string | null
  createdAt: Date
  paidAt?: Date | null
  updatedAt: Date
  expiresAt: Date
}
