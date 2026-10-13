import { create } from 'zustand'
import * as api from '../services/api'
import Taro from '@tarojs/taro'
import { CaseRequestContext, CaseRequestGuard } from './request-guard'

interface AppState {
  user: api.User | null
  token: string | null
  isLoggedIn: boolean
  authRetryable: boolean
  currentCase: api.Case | null
  isLoadingCase: boolean
  messages: api.Message[]
  conversationState: api.ConversationState
  isAiTyping: boolean
  materials: api.Material[]
  uploadingFiles: Map<string, number>
  currentReport: api.ReportData | null
  isGeneratingReport: boolean

  login: (code: string) => Promise<void>
  logout: () => void
  checkLoginStatus: () => Promise<boolean>
  retryAuth: () => Promise<boolean>
  loadCurrentCase: () => Promise<void>
  createCase: () => Promise<void>
  updateCase: (updates: Partial<api.Case>) => Promise<void>
  loadMessages: () => Promise<void>
  sendMessage: (content: string, action?: string, artifactIds?: string[]) => Promise<void>
  setAiTyping: (typing: boolean) => void
  uploadImage: (filePath: string) => Promise<api.UploadedImage>
  processMaterial: (type: api.MaterialType, artifactId: string) => Promise<api.Material>
  setUploadProgress: (fileId: string, progress: number) => void
  addMaterial: (material: api.Material) => void
  confirmMaterial: (materialId: string, fields: api.MaterialField[]) => Promise<void>
  generateReport: () => Promise<void>
  loadReport: (caseId: string) => Promise<void>
  reset: () => void
}

const initialState = {
  user: null,
  token: api.getToken(),
  isLoggedIn: !!api.getToken(),
  authRetryable: false,
  currentCase: null,
  isLoadingCase: false,
  messages: [] as api.Message[],
  conversationState: 'collecting' as api.ConversationState,
  isAiTyping: false,
  materials: [] as api.Material[],
  uploadingFiles: new Map<string, number>(),
  currentReport: null as api.ReportData | null,
  isGeneratingReport: false
}

/**
 * 会话内案件请求上下文。任何案件切换/创建都会 bump epoch，
 * 使旧案件的迟到响应在下发 set 前被丢弃，避免串案数据。
 */
const requestGuard = new CaseRequestGuard()

function beginCaseSession(caseId: string | null): CaseRequestContext | null {
  return caseId ? requestGuard.activate(caseId) : (requestGuard.invalidate(), null)
}

function isStale(context: CaseRequestContext): boolean {
  return !requestGuard.isCurrent(context)
}

api.setUnauthorizedHandler(() => {
  beginCaseSession(null)
  useAppStore.setState({
    ...initialState,
    uploadingFiles: new Map(),
    authRetryable: true
  })
  Taro.showToast({ title: '登录已过期，请重新进入', icon: 'none' })
})

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  login: async (code) => {
    const result = await api.login(code)
    set({
      token: result.token,
      isLoggedIn: true,
      user: result.user,
      authRetryable: false
    })
  },

  logout: () => {
    api.logout()
    beginCaseSession(null)
    set({
      ...initialState,
      token: null,
      isLoggedIn: false,
      uploadingFiles: new Map()
    })
  },

  checkLoginStatus: async () => {
    const restoreSession = async () => {
      try {
        const loginResult = await Taro.login()
        if (!loginResult.code) return false
        await get().login(loginResult.code)
        return true
      } catch {
        return false
      }
    }

    const token = api.getToken()
    try {
      if (token) {
        try {
          const user = await api.getSession()
          set({ token, isLoggedIn: true, user })
        } catch {
          api.clearToken()
          if (!await restoreSession()) {
            set({ isLoggedIn: false, authRetryable: true })
            return false
          }
        }
      } else if (!await restoreSession()) {
        set({ isLoggedIn: false, authRetryable: true })
        return false
      }

      await get().loadCurrentCase()
      return true
    } catch (error) {
      console.error('Login restore error:', error)
      api.clearToken()
      beginCaseSession(null)
      set({ user: null, token: null, isLoggedIn: false, authRetryable: true })
      return false
    }
  },

  retryAuth: async () => {
    set({ authRetryable: false })
    return get().checkLoginStatus()
  },

  loadCurrentCase: async () => {
    const requestEpoch = requestGuard.invalidate()
    set({ isLoadingCase: true, isAiTyping: false })
    try {
      const currentCase = await api.getCurrentCase()
      if (requestEpoch !== requestGuard.getSnapshot().epoch) return
      if (!currentCase) {
        requestGuard.invalidate()
        set({
          currentCase: null,
          isLoadingCase: false,
          materials: [],
          messages: [],
          currentReport: null,
          conversationState: 'collecting'
        })
        return
      }

      const isDifferentCase = get().currentCase?.id !== currentCase.id
      const context = beginCaseSession(currentCase.id)!
      set({
        currentCase,
        isLoadingCase: false,
        ...(isDifferentCase ? {
          materials: [],
          messages: [],
          currentReport: null,
          conversationState: 'collecting' as api.ConversationState
        } : {})
      })

      const [materialsResult, historyResult, reportResult] = await Promise.allSettled([
        api.getMaterials(currentCase.id),
        api.getConversationHistory(currentCase.id),
        currentCase.hasReport ? api.getReport(currentCase.id) : Promise.resolve(null)
      ])
      if (isStale(context)) return

      const patch: Partial<AppState> = {}
      if (materialsResult.status === 'fulfilled') patch.materials = materialsResult.value
      if (historyResult.status === 'fulfilled') {
        patch.messages = historyResult.value.messages
        patch.conversationState = historyResult.value.conversationState
          || historyResult.value.agentState?.stage
          || 'collecting'
      }
      if (reportResult.status === 'fulfilled') patch.currentReport = reportResult.value
      set(patch)
    } catch (error) {
      if (requestEpoch !== requestGuard.getSnapshot().epoch) return
      requestGuard.invalidate()
      set({ currentCase: null, materials: [], messages: [], currentReport: null, isLoadingCase: false })
      console.error('Load case error:', error)
    }
  },

  createCase: async () => {
    try {
      const currentCase = await api.createCase()
      beginCaseSession(currentCase.id)
      set({
        currentCase,
        isLoadingCase: false,
        materials: [],
        messages: [],
        currentReport: null,
        conversationState: 'collecting',
        isAiTyping: false
      })
    } catch (error: unknown) {
      Taro.showToast({ title: (error as Error).message || '创建案件失败', icon: 'none' })
      throw error
    }
  },

  updateCase: async (updates) => {
    const currentCase = await api.updateCase(updates)
    set(state => (state.currentCase && state.currentCase.id === currentCase.id
      ? { currentCase }
      : state.currentCase ? {} : { currentCase }))
  },

  loadMessages: async () => {
    const currentCase = get().currentCase
    if (!currentCase) return
    const context = requestGuard.capture(currentCase.id)
    try {
      const history = await api.getConversationHistory(currentCase.id)
      if (isStale(context)) return
      set({
        messages: history.messages,
        conversationState: history.conversationState || history.agentState?.stage || 'collecting'
      })
    } catch (error) {
      if (isStale(context)) return
      throw error
    }
  },

  sendMessage: async (content, action, artifactIds) => {
    const currentCase = get().currentCase
    if (!currentCase) {
      Taro.showToast({ title: '请先创建案件', icon: 'none' })
      return
    }
    const context = requestGuard.capture(currentCase.id)
    const temporaryMessage: api.Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    set(state => ({
      messages: [...state.messages, temporaryMessage],
      isAiTyping: true
    }))

    try {
      const response = await api.sendMessage(currentCase.id, content, action, artifactIds)
      if (isStale(context)) return
      const assistantMessage: api.Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        quickReplies: response.quickReplies,
        timestamp: new Date().toISOString()
      }
      set(state => ({
        messages: [...state.messages.filter(message => message.id !== temporaryMessage.id), temporaryMessage, assistantMessage],
        conversationState: response.agentState?.stage || state.conversationState,
        isAiTyping: false
      }))
    } catch (error: unknown) {
      if (isStale(context)) return
      set(state => ({
        messages: state.messages.filter(message => message.id !== temporaryMessage.id),
        isAiTyping: false
      }))
      Taro.showToast({ title: (error as Error).message || '发送失败', icon: 'none' })
      throw error
    }
  },

  setAiTyping: (typing) => set({ isAiTyping: typing }),

  uploadImage: async (filePath) => {
    const currentCase = get().currentCase
    if (!currentCase) throw new Error('请先创建案件')
    const fileId = `upload-${Date.now()}`
    get().setUploadProgress(fileId, 10)
    try {
      const result = await api.uploadImage(filePath, currentCase.id)
      get().setUploadProgress(fileId, 100)
      setTimeout(() => {
        set(state => {
          const uploadingFiles = new Map(state.uploadingFiles)
          uploadingFiles.delete(fileId)
          return { uploadingFiles }
        })
      }, 200)
      return result
    } catch (error) {
      set(state => {
        const uploadingFiles = new Map(state.uploadingFiles)
        uploadingFiles.delete(fileId)
        return { uploadingFiles }
      })
      throw error
    }
  },

  processMaterial: async (type, artifactId) => {
    const currentCase = get().currentCase
    if (!currentCase) throw new Error('请先创建案件')
    const context = requestGuard.capture(currentCase.id)
    const material = await api.processMaterial(type, artifactId, currentCase.id)
    if (isStale(context)) throw new Error('案件已切换，请在当前案件重新上传')
    get().addMaterial(material)
    return material
  },

  setUploadProgress: (fileId, progress) => {
    set(state => {
      const uploadingFiles = new Map(state.uploadingFiles)
      uploadingFiles.set(fileId, progress)
      return { uploadingFiles }
    })
  },

  addMaterial: (material) => {
    set(state => {
      const activeCaseId = requestGuard.getSnapshot().activeCaseId
      if (activeCaseId && material.caseId && material.caseId !== activeCaseId) return {}
      return { materials: [...state.materials, material] }
    })
  },

  confirmMaterial: async (materialId, fields) => {
    const material = get().materials.find(item => item.id === materialId)
    const currentCase = get().currentCase
    if (!material || !currentCase) return
    const context = requestGuard.capture(currentCase.id)

    const result = await api.confirmMaterial(
      currentCase.id,
      material.id,
      fields,
      material.rawText
    )
    if (isStale(context)) return
    const confirmedMaterial = result.material || { ...material, fields, confirmed: result.confirmed }
    set(state => ({
      materials: state.materials.map(item => item.id === materialId ? confirmedMaterial : item)
    }))
    await get().loadCurrentCase()
  },

  generateReport: async () => {
    const currentCase = get().currentCase
    if (!currentCase) {
      Taro.showToast({ title: '请先创建案件', icon: 'none' })
      return
    }
    const facts = get().materials
      .filter(material => material.confirmed)
      .flatMap(material =>
      material.fields.map(field => ({
        label: field.label,
        value: field.value,
        confirmed: true
      }))
    )

    if (facts.length === 0) {
      Taro.showToast({ title: '请先确认至少一份材料', icon: 'none' })
      return
    }

    const context = requestGuard.capture(currentCase.id)
    set({ isGeneratingReport: true })
    try {
      const report = await api.generateReport(currentCase.id, facts)
      if (isStale(context)) return
      set(state => ({
        currentReport: report,
        isGeneratingReport: false,
        currentCase: state.currentCase ? { ...state.currentCase, hasReport: true } : null
      }))
    } catch (error: unknown) {
      if (isStale(context)) return
      set({ isGeneratingReport: false })
      Taro.showToast({ title: (error as Error).message || '报告生成失败', icon: 'none' })
      throw error
    }
  },

  loadReport: async (caseId) => {
    const context = requestGuard.capture(caseId)
    try {
      const report = await api.getReport(caseId)
      if (isStale(context)) return
      if (report?.caseId === caseId || !report?.caseId) {
        set({ currentReport: report })
      }
    } catch (error) {
      if (isStale(context)) return
      if ((error as { statusCode?: number }).statusCode !== 404) throw error
    }
  },

  reset: () => {
    beginCaseSession(null)
    set({ ...initialState, uploadingFiles: new Map() })
  }
}))

export function __getCaseSessionForTests(): { activeCaseId: string | null; epoch: number } {
  return requestGuard.getSnapshot()
}
