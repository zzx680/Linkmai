// 数据库抽象层：统一内存数据库和 PostgreSQL 接口
import { memoryDB } from './memory'
import { db as postgresDB } from './postgres'

const USE_POSTGRES = process.env.USE_POSTGRES === 'true'

export const db = USE_POSTGRES ? postgresDB : memoryDB

// 导出类型定义供其他模块使用
export interface User {
  id: string
  openid: string
  phone?: string
  nickname?: string
  avatar?: string
  created_at: Date
  updated_at: Date
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
