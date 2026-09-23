import Taro from '@tarojs/taro'

const API_BASE = 'http://localhost:8000/api'

type RequestConfig = {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
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

async function request<T = any>(config: RequestConfig): Promise<T> {
  const token = getToken()
  const response = await Taro.request({
    url: `${API_BASE}${config.url}`,
    method: config.method || 'GET',
    data: config.data,
    header: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...config.headers
    }
  })

  if (response.statusCode === 401) {
    clearToken()
    throw new Error('登录已过期，请重新登录')
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data as any
    throw new Error(body?.message || body?.error || '请求失败')
  }

  const body = response.data as any
  return body?.data !== undefined ? body.data : body
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

export async function login(code: string): Promise<LoginResponse> {
  const result = await request<LoginResponse>({
    url: '/auth/wechat/login',
    method: 'POST',
    data: { code }
  })
  setToken(result.token)
  return result
}

export function logout() {
  clearToken()
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
  entitlement?: CaseEntitlement
}

export interface PaymentOrderResponse {
  alreadyPaid: boolean
  orderId?: string
  orderNo?: string
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

export async function getCurrentCase(): Promise<Case | null> {
  return request<Case | null>({ url: '/cases/current' })
}

export async function createCase(): Promise<Case> {
  return request<Case>({ url: '/cases/current', method: 'POST' })
}

export async function updateCase(updates: Partial<Case>): Promise<Case> {
  return request<Case>({ url: '/cases/current', method: 'PUT', data: updates })
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

function normalizeMessage(message: any, index: number): Message {
  return {
    id: message.id || `message-${index}`,
    role: message.role || 'assistant',
    content: message.content || message.text || '',
    images: message.metadata?.images || message.images || [],
    quickReplies: message.metadata?.quickReplies || message.quickReplies || [],
    timestamp: message.timestamp || message.createdAt || new Date().toISOString()
  }
}

export async function getConversationHistory(): Promise<ConversationHistory> {
  const result = await request<any>({ url: '/conversations/current/messages' })
  const messages = Array.isArray(result) ? result.map(normalizeMessage) : []
  return { messages }
}

export async function sendMessage(
  text: string,
  images?: string[],
  materialType?: MaterialType
): Promise<SendMessageResponse> {
  return request<SendMessageResponse>({
    url: '/conversations/current/messages',
    method: 'POST',
    data: { text, images, materialType }
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

export async function uploadImage(filePath: string): Promise<{ url: string; key: string }> {
  return new Promise((resolve, reject) => {
    const token = getToken()
    Taro.uploadFile({
      url: `${API_BASE}/upload/image`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (response) => {
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
  imageUrl: string
): Promise<MaterialProcessResult> {
  return request<MaterialProcessResult>({
    url: '/materials/process',
    method: 'POST',
    data: { materialType, imageUrl }
  })
}

export async function confirmMaterial(
  caseId: string,
  materialType: MaterialType | string,
  imageUrl: string,
  fields: MaterialField[],
  rawText?: string
): Promise<{ confirmed: boolean }> {
  return request<{ confirmed: boolean }>({
    url: '/materials/confirm',
    method: 'POST',
    data: { caseId, materialType, imageUrl, fields, rawText }
  })
}

export async function getMaterials(caseId: string): Promise<Material[]> {
  return request<Material[]>({ url: `/materials/${caseId}` })
}

export interface ReportData {
  caseId?: string
  analysis: string
  liability: string
  compensation: string
  recommendations: string[]
  generatedAt: string
}

export interface ReportResponse {
  report: ReportData
}

export async function generateReport(facts: Array<{ label: string; value: string; confirmed: boolean }>): Promise<ReportData> {
  return request<ReportData>({
    url: '/reports/generate',
    method: 'POST',
    data: { facts }
  })
}

export async function getReport(caseId: string): Promise<any> {
  return request<any>({ url: `/reports/${caseId}` })
}

export async function exportReport(caseId: string, format: 'pdf' | 'word') {
  return request<{ downloadUrl?: string; message?: string }>({
    url: `/reports/${caseId}/export`,
    method: 'POST',
    data: { format }
  })
}

export { getToken, setToken, clearToken }
