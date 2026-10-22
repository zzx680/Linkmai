import Taro from '@tarojs/taro'
import { getApiBase } from '../config/env'
import { readReportEnvelope, ReportContract, ReportEnvelope } from './report-contract'

const API_BASE = getApiBase()

type RequestConfig = {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: Record<string, unknown>
  headers?: Record<string, string>
}

function getToken(): string | null {
  try {
    return Taro.getStorageSync('token') || null
  } catch {
    return null
  }
}

function setToken(token: string) {
  Taro.setStorageSync('token', token)
}

function clearToken() {
  Taro.removeStorageSync('token')
}

let onUnauthorized: (() => void) | undefined
export function setUnauthorizedHandler(handler: () => void) { onUnauthorized = handler }
function expireSession(token: string | null) {
  if (token !== getToken()) return
  clearToken()
  onUnauthorized?.()
}

export class ApiError extends Error {
  constructor(message: string, public readonly statusCode: number) { super(message) }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string) { super(message, 401) }
}

async function request<T>(config: RequestConfig): Promise<T> {
  const token = getToken()
  try {
    const response = await Taro.request({
      url: `${API_BASE}${config.url}`,
      method: config.method || 'GET',
      timeout: 15000,
      data: config.data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...config.headers
      }
    })

    if (response.statusCode === 401) {
      expireSession(token)
      throw new UnauthorizedError('登录已过期，请重新登录')
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const body = response.data as { message?: string; error?: string } | undefined
      throw new ApiError(body?.message || body?.error || '请求失败', response.statusCode)
    }

    const body = response.data as { data?: unknown } | undefined
    return (body?.data !== undefined ? body.data : body) as T
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ApiError) throw error
    if ((error as { statusCode?: number }).statusCode === 401) {
      expireSession(token)
      throw new UnauthorizedError('登录已过期，请重新登录')
    }
    const detail = (error as { errMsg?: string }).errMsg || ''
    if (/timeout/i.test(detail)) throw new ApiError('连接超时，请检查网络后重试', 0)
    if (/domain|url not in domain/i.test(detail)) throw new ApiError('服务域名未获微信许可，请检查小程序域名配置', 0)
    throw new ApiError('无法连接服务，请确认网络及 API 服务可用', 0)
  }
}

export interface User {
  id: string
  openid: string
  nickname?: string
  avatar?: string
}

export interface LoginResponse {
  token: string
  user: User
}

export async function getSession(): Promise<User> {
  return request<User>({ url: '/auth/session' })
}

export async function login(code: string): Promise<LoginResponse> {
  const result = await request<LoginResponse>({
    url: '/auth/wechat/login',
    method: 'POST',
    data: { code }
  })
  return result
}

export async function updateProfile(nickname: string): Promise<User> {
  return request<User>({
    url: '/auth/profile',
    method: 'PATCH',
    data: { nickname }
  })
}

export async function uploadProfileAvatar(filePath: string): Promise<User> {
  return new Promise((resolve, reject) => {
    const token = getToken()
    Taro.uploadFile({
      url: `${API_BASE}/auth/profile/avatar`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: response => {
        if (response.statusCode === 401) {
          expireSession(token)
          reject(new UnauthorizedError('登录已过期，请重新登录'))
          return
        }
        let body: { data?: User; message?: string; error?: string } | undefined
        try {
          body = JSON.parse(response.data)
        } catch {
          reject(new ApiError('头像上传响应解析失败', response.statusCode))
          return
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new ApiError(body?.message || body?.error || '头像上传失败', response.statusCode))
          return
        }
        if (!body?.data) {
          reject(new ApiError('头像上传响应无效', response.statusCode))
          return
        }
        resolve(body.data)
      },
      fail: reject
    })
  })
}

export function logout() {
  clearToken()
}

export async function submitFeedback(content: string): Promise<{ id: string; createdAt: string }> {
  return request<{ id: string; createdAt: string }>({
    url: '/feedback',
    method: 'POST',
    data: { content }
  })
}

export type PrivacyRequestKind = 'export_data' | 'delete_data' | 'close_account'
export interface PrivacyRequest {
  id: string
  kind: PrivacyRequestKind
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  response: string | null
  createdAt: string
  updatedAt: string
}

export function getPrivacyRequests(): Promise<PrivacyRequest[]> {
  return request<PrivacyRequest[]>({ url: '/privacy/requests' })
}

export function submitPrivacyRequest(kind: PrivacyRequestKind): Promise<PrivacyRequest> {
  return request<PrivacyRequest>({ url: '/privacy/requests', method: 'POST', data: { kind } })
}

export interface CaseEntitlement {
  status: 'unpaid' | 'pending' | 'paid' | 'refunded'
  amountCents: number
  currency: string
  paidAt?: string | null
  features?: {
    fullReport: boolean
    compensationEstimate: boolean
    actionPlan: boolean
    documentGeneration: boolean
    rerunAfterMaterialUpdate: boolean
  }
}

export interface Case {
  id: string
  userId: string
  title: string
  accidentType?: string
  accidentDate?: string
  status: string
  statusLabel: string
  materialCount: number
  liability?: string
  compensation?: string
  hasReport: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  entitlement?: CaseEntitlement
  nextAction?: 'create_case' | 'continue_materials' | 'confirm_materials' | 'unlock_full_plan' | 'view_report' | 'continue_case'
}

export interface PaymentOrder {
  orderId: string
  orderNo?: string
  caseId: string
  status: 'created' | 'pending' | 'paid' | 'failed' | 'closed' | 'refunded'
  amountCents?: number
  currency?: string
  paidAt?: string | null
  createdAt?: string
  updatedAt?: string
  entitlement?: CaseEntitlement
}

export interface PaymentOrderResponse {
  alreadyPaid: boolean
  orderId?: string
  orderNo?: string
  amountCents?: number
  currency?: string
  payment?: {
    timeStamp: string
    nonceStr: string
    package: string
    signType: 'RSA' | 'MD5'
    paySign: string
  }
  expiresAt?: string
  entitlement?: CaseEntitlement
}

export interface PaymentOrderRecord extends PaymentOrder {
  orderNo: string
  amountCents: number
  currency: string
  createdAt: string
  updatedAt: string
}

export interface PaymentOrderList {
  orders: PaymentOrderRecord[]
  hasMore: boolean
  nextOffset: number
}

export async function listPaymentOrders(offset = 0): Promise<PaymentOrderList> {
  return request<PaymentOrderList>({ url: `/payment-orders?limit=20&offset=${offset}` })
}

export async function getCurrentCase(): Promise<Case | null> {
  return request<Case | null>({ url: '/cases/current' })
}

export async function createCase(): Promise<Case> {
  return request<Case>({ url: '/cases/current', method: 'POST' })
}

export async function updateCase(updates: Partial<Case>): Promise<Case> {
  return request<Case>({ url: '/cases/current', method: 'PATCH', data: updates })
}

export async function getCurrentCaseEntitlement(): Promise<CaseEntitlement & { caseId: string }> {
  return request<CaseEntitlement & { caseId: string }>({ url: '/cases/current/entitlement' })
}

export async function createPaymentOrder(caseId: string, idempotencyKey: string): Promise<PaymentOrderResponse> {
  return request<PaymentOrderResponse>({
    url: `/cases/${caseId}/payment-orders`,
    method: 'POST',
    data: { currency: 'CNY' },
    headers: { 'Idempotency-Key': idempotencyKey }
  })
}

export async function getPaymentOrder(orderId: string): Promise<PaymentOrder> {
  return request<PaymentOrder>({ url: `/payment-orders/${orderId}` })
}

export interface QuickReply {
  text?: string
  label?: string
  value: string
  action?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  images?: string[]
  quickReplies?: QuickReply[]
  timestamp: string
}

export type ConversationState = 'collecting' | 'confirming' | 'analyzing' | 'ready'

export interface ConversationHistory {
  messages: Message[]
  conversationState?: ConversationState
  agentState?: { stage: ConversationState; collectedFactsCount?: number }
}

export interface SendMessageResponse {
  message: string
  quickReplies?: QuickReply[]
  agentState?: { stage: ConversationState; collectedFactsCount?: number }
}

function normalizeMessage(message: unknown, index: number): Message {
  const value = message as {
    id?: string
    role?: Message['role']
    content?: string
    text?: string
    metadata?: { images?: string[]; quickReplies?: QuickReply[] }
    images?: string[]
    quickReplies?: QuickReply[]
    timestamp?: string
    createdAt?: string
  }
  return {
    id: value.id || `message-${index}`,
    role: value.role || 'assistant',
    content: value.content || value.text || '',
    images: value.metadata?.images || value.images || [],
    quickReplies: value.metadata?.quickReplies || value.quickReplies || [],
    timestamp: value.timestamp || value.createdAt || new Date().toISOString()
  }
}

export async function getConversationHistory(caseId: string): Promise<ConversationHistory> {
  const result = await request<ConversationHistory | Message[]>({
    url: `/conversations/current/messages?caseId=${encodeURIComponent(caseId)}`
  })
  if (Array.isArray(result)) return { messages: result.map(normalizeMessage) }
  return { ...result, messages: (result.messages || []).map(normalizeMessage) }
}

export async function sendMessage(
  caseId: string,
  text: string,
  action?: string,
  artifactIds?: string[]
): Promise<SendMessageResponse> {
  return request<SendMessageResponse>({
    url: '/conversations/current/messages',
    method: 'POST',
    data: { caseId, text, action, artifactIds }
  })
}

export type MaterialType =
  | 'accident_report'
  | 'id_card'
  | 'driver_license'
  | 'vehicle_license'
  | 'medical_record'
  | 'scene_photo'
  | 'other'

export interface MaterialField {
  key: string
  label: string
  value: string
  confidence?: 'high' | 'medium' | 'low'
}

export interface Material {
  id: string
  caseId?: string
  type: MaterialType | string
  imageUrl: string
  fields: MaterialField[]
  rawText?: string
  status: 'processing' | 'processed' | 'failed'
  confirmed?: boolean
  createdAt: string
}

export interface MaterialProcessResult {
  type: string
  fields: MaterialField[]
  rawText?: string
}

export interface UploadedImage {
  url: string
  key: string
  artifactId: string
}

export async function uploadImage(filePath: string, caseId: string): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const token = getToken()
    Taro.uploadFile({
      url: `${API_BASE}/upload/image`,
      filePath,
      name: 'file',
      formData: { caseId },
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (response) => {
        if (response.statusCode === 401) {
          expireSession(token)
          reject(new UnauthorizedError('登录已过期，请重新登录'))
          return
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error('上传失败'))
          return
        }
        try {
          const body = JSON.parse(response.data)
          resolve(body.data || body)
        } catch {
          reject(new Error('上传响应解析失败'))
        }
      },
      fail: reject
    })
  })
}

export async function processMaterial(
  materialType: MaterialType,
  artifactId: string,
  caseId: string
): Promise<Material> {
  return request<Material>({
    url: '/materials/process',
    method: 'POST',
    data: { materialType, artifactId, caseId }
  })
}

export async function confirmMaterial(
  caseId: string,
  artifactId: string,
  fields: MaterialField[],
  rawText?: string
): Promise<{ confirmed: boolean; material?: Material | null }> {
  return request<{ confirmed: boolean; material?: Material | null }>({
    url: '/materials/confirm',
    method: 'POST',
    data: { caseId, artifactId, fields, rawText }
  })
}

export async function getMaterials(caseId: string): Promise<Material[]> {
  return request<Material[]>({ url: `/materials/${caseId}` })
}

export interface ReportData extends ReportContract {}

export type ReportResponse = ReportEnvelope<ReportData>

export async function generateReport(
  caseId: string,
  facts: Array<{ label: string; value: string; confirmed: boolean }>
): Promise<ReportData> {
  const result = await request<ReportResponse>({
    url: '/reports/generate',
    method: 'POST',
    data: { caseId, facts }
  })
  return readReportEnvelope(result)
}

export async function getReport(caseId: string): Promise<ReportData> {
  const result = await request<ReportResponse>({ url: `/reports/${caseId}` })
  return readReportEnvelope(result)
}

export { getToken, setToken, clearToken }
