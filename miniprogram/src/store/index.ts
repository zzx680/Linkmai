import { create } from 'zustand'
import * as api from '../services/api'
import Taro from '@tarojs/taro'
import { CaseRequestContext, CaseRequestGuard } from './request-guard'
import { isPendingReport } from '../services/report-contract'
import { ensureAccountConsent, ensureCaseDataConsent } from '../utils/privacy-consent'

interface AppState {
  user: api.User | null
  token: string | null
  isLoggedIn: boolean
  authRetryable: boolean
  authError: string | null
  isAuthenticating: boolean
  currentCase: api.Case | null
  isLoadingCase: boolean
  caseLoadError: string | null
  messages: api.Message[]
  conversationState: api.ConversationState
  isAiTyping: boolean
  materials: api.Material[]
  uploadingFiles: Map<string, number>
  currentReport: api.ReportData | null
  isGeneratingReport: boolean
  reportRunId: string | null
  reportRunStatus: api.ReportRun['status'] | null
  reportRunError: string | null
  refreshReportRun: () => Promise<boolean>

  login: (code: string) => Promise<void>
  logout: () => void
  checkLoginStatus: () => Promise<boolean>
  retryAuth: () => Promise<boolean>
  updateProfile: (nickname: string) => Promise<api.User>
  uploadProfileAvatar: (filePath: string) => Promise<api.User>
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

function createInitialState(token: string | null = null) {
  return {
  user: null,
  token,
  isLoggedIn: Boolean(token),
  authRetryable: false,
  authError: null as string | null,
  isAuthenticating: false,
  currentCase: null,
  isLoadingCase: false,
  caseLoadError: null,
  messages: [] as api.Message[],
  conversationState: 'collecting' as api.ConversationState,
  isAiTyping: false,
  materials: [] as api.Material[],
  uploadingFiles: new Map<string, number>(),
  currentReport: null as api.ReportData | null,
  isGeneratingReport: false,
  reportRunId: null as string | null,
  reportRunStatus: null as api.ReportRun['status'] | null,
  reportRunError: null as string | null
  }
}

const initialState = createInitialState(api.getToken())
let authRevision = 0
let authPromise: Promise<boolean> | null = null
let sendingCaseId: string | null = null

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
    ...createInitialState(null),
    uploadingFiles: new Map(),
    authRetryable: true
  })
  Taro.showToast({ title: '登录已过期，请重新进入', icon: 'none' })
})

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  login: async (code) => {
    const revision = authRevision
    const result = await api.login(code)
    if (revision !== authRevision) return
    api.setToken(result.token)
    set({
      token: result.token,
      isLoggedIn: true,
      user: result.user,
      authRetryable: false,
      authError: null
    })
  },

  logout: () => {
    authRevision += 1
    authPromise = null
    api.logout()
    beginCaseSession(null)
    set({
      ...createInitialState(null),
      token: null,
      isLoggedIn: false,
      uploadingFiles: new Map()
    })
  },

  checkLoginStatus: () => {
    if (authPromise) return authPromise
    const revision = authRevision
    set({ isAuthenticating: true, authError: null })
    const restore = async () => {
      try {
        const token = api.getToken()
        let needsLogin = !token
        if (token) {
          try {
            const user = await api.getSession()
            if (revision !== authRevision) return false
            set({ token, isLoggedIn: true, user })
          } catch (error) {
            if (!(error instanceof api.UnauthorizedError)) throw error
            needsLogin = true
          }
        }
        if (needsLogin) {
          if (!await ensureAccountConsent() || revision !== authRevision) return false
          let code: string | undefined
          try {
            code = (await Taro.login()).code
          } catch {
            throw new Error('微信授权未完成，请确认开发者工具已登录并重试')
          }
          if (revision !== authRevision) return false
          if (!code) throw new Error('未获取到微信授权码，请重新登录')
          await get().login(code)
          if (revision !== authRevision) return false
        }
        set({ authRetryable: false, authError: null })
        await get().loadCurrentCase()
        return get().isLoggedIn
      } catch (error) {
        if (revision !== authRevision) return false
        const message = error instanceof Error ? error.message : '登录暂不可用，请稍后重试'
        set({ authRetryable: true, authError: message })
        return false
      } finally {
        if (revision === authRevision) {
          set({ isAuthenticating: false })
          authPromise = null
        }
      }
    }
    authPromise = restore()
    return authPromise
  },

  retryAuth: () => get().checkLoginStatus(),

  updateProfile: async (nickname) => {
    const state = get()
    const token = state.token
    const userId = state.user?.id
    if (!token || !userId) throw new Error('请先登录')
    const user = await api.updateProfile(nickname)
    const latest = get()
    if (!latest.isLoggedIn || latest.token !== token || latest.user?.id !== userId) {
      throw new Error('登录状态已变化，请重试')
    }
    set({ user })
    return user
  },

  uploadProfileAvatar: async (filePath) => {
    const state = get()
    const token = state.token
    const userId = state.user?.id
    if (!token || !userId) throw new Error('请先登录')
    const user = await api.uploadProfileAvatar(filePath)
    const latest = get()
    if (!latest.isLoggedIn || latest.token !== token || latest.user?.id !== userId) {
      throw new Error('登录状态已变化，请重试')
    }
    set({ user })
    return user
  },

  loadCurrentCase: async () => {
    const requestEpoch = requestGuard.invalidate()
    set({ isLoadingCase: true, caseLoadError: null, isAiTyping: false })
    try {
      const currentCase = await api.getCurrentCase()
      if (requestEpoch !== requestGuard.getSnapshot().epoch) return
      if (!currentCase) {
        requestGuard.invalidate()
        set({
          currentCase: null,
          isLoadingCase: false,
          caseLoadError: null,
          materials: [],
          messages: [],
          currentReport: null,
          reportRunId: null,
          reportRunStatus: null,
          reportRunError: null,
          isGeneratingReport: false,
          conversationState: 'collecting'
        })
        return
      }

      const isDifferentCase = get().currentCase?.id !== currentCase.id
      const context = beginCaseSession(currentCase.id)!
      set({
        currentCase,
        isLoadingCase: false,
        caseLoadError: null,
        reportRunId: null,
        reportRunStatus: null,
        reportRunError: null,
        isGeneratingReport: false,
        ...(!currentCase.hasReport ? { currentReport: null } : {}),
        ...(isDifferentCase ? {
          materials: [],
          messages: [],
          currentReport: null,
          reportRunId: null,
          reportRunStatus: null,
          reportRunError: null,
          isGeneratingReport: false,
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
      await get().refreshReportRun().catch(() => undefined)
    } catch (error) {
      if (requestEpoch !== requestGuard.getSnapshot().epoch) return
      requestGuard.invalidate()
      set({ isLoadingCase: false, caseLoadError: (error as Error).message || '案件加载失败，请重试' })
      console.error('Load case error:', error)
    }
  },

  createCase: async () => {
    const token = get().token
    const userId = get().user?.id
    const epoch = requestGuard.getSnapshot().epoch
    try {
      const currentCase = await api.createCase()
      const latest = get()
      if (!latest.isLoggedIn || latest.token !== token || latest.user?.id !== userId
        || requestGuard.getSnapshot().epoch !== epoch) return
      beginCaseSession(currentCase.id)
      set({
        currentCase,
        isLoadingCase: false,
        materials: [],
        messages: [],
        currentReport: null,
        reportRunId: null,
        reportRunStatus: null,
        reportRunError: null,
        isGeneratingReport: false,
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
    if (sendingCaseId === currentCase.id) return
    sendingCaseId = currentCase.id
    const context = requestGuard.capture(currentCase.id)
    try {
      const userId = get().user?.id
      if (!userId || !await ensureCaseDataConsent(userId)) throw new Error('尚未同意案件资料处理，可查看隐私说明后再试')
      if (isStale(context)) throw new Error('案件已切换，请重新发送')
    } catch (error) {
      sendingCaseId = null
      throw error
    }
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
      if (isStale(context)) {
        set(state => state.currentCase?.id === currentCase.id ? { isGeneratingReport: false } : {})
        return
      }
      set(state => ({
        messages: state.messages.filter(message => message.id !== temporaryMessage.id),
        isAiTyping: false
      }))
      Taro.showToast({ title: (error as Error).message || '发送失败', icon: 'none' })
      throw error
    } finally {
      if (sendingCaseId === currentCase.id) sendingCaseId = null
    }
  },

  setAiTyping: (typing) => set({ isAiTyping: typing }),

  uploadImage: async (filePath) => {
    const currentCase = get().currentCase
    if (!currentCase) throw new Error('请先创建案件')
    const context = requestGuard.capture(currentCase.id)
    const userId = get().user?.id
    if (!userId || !await ensureCaseDataConsent(userId)) throw new Error('尚未同意案件资料处理，可查看隐私说明后再试')
    if (isStale(context)) throw new Error('案件已切换，请重新上传')
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
    const userId = get().user?.id
    if (!userId || !await ensureCaseDataConsent(userId)) throw new Error('尚未同意案件资料处理，可查看隐私说明后再试')
    if (isStale(context)) throw new Error('案件已切换，请重新处理')
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

  refreshReportRun: async () => {
    const currentCase = get().currentCase
    if (!currentCase) return false
    const context = requestGuard.capture(currentCase.id)
    const previousRunId = get().reportRunId
    const wasGenerating = get().isGeneratingReport
    try {
      const run = previousRunId
        ? await api.getReportRun(currentCase.id, previousRunId)
        : await api.getLatestReportRun(currentCase.id)
      if (isStale(context) || get().reportRunId !== previousRunId) return false
      if (!run) {
        if (wasGenerating || get().isGeneratingReport) return true
        if (currentCase.hasReport && !get().currentReport) await get().loadReport(currentCase.id)
        if (isStale(context)) return false
        set({ reportRunId: null, reportRunStatus: null, reportRunError: null, isGeneratingReport: false })
        return false
      }
      if (run.status === 'succeeded') {
        if (run.confirmationRequired) {
          set({ reportRunId: null, reportRunStatus: null, reportRunError: null, isGeneratingReport: false })
          return false
        }
        const report = await api.getReport(currentCase.id)
        if (isStale(context) || get().reportRunId !== previousRunId) return false
        if (!report || (report.caseId && report.caseId !== currentCase.id)) throw new Error('报告暂不可用')
        set({ currentReport: report, reportRunId: null, reportRunStatus: null, reportRunError: null, isGeneratingReport: false,
          currentCase: { ...get().currentCase!, hasReport: true } })
        return false
      }
      const pending = run.status === 'queued' || run.status === 'running'
      set({ reportRunId: run.runId, reportRunStatus: run.status, isGeneratingReport: pending,
        reportRunError: pending ? null : run.status === 'stale' ? '案件信息已更新，请核对后重新生成' : run.safeErrorCode === 'PAYMENT_REQUIRED' ? '案件权益已变更，请查看付费记录' : '本次分析未完成，请更新案件信息后重新生成' })
      return pending
    } catch (error) {
      if (isStale(context) || get().reportRunId !== previousRunId) return false
      set({ isGeneratingReport: false, reportRunError: '进度暂时无法查询，请刷新进度；不会重复生成报告' })
      throw error
    }
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

    if (get().reportRunId) {
      await get().refreshReportRun()
      return
    }
    if (get().isGeneratingReport) return

    const context = requestGuard.capture(currentCase.id)
    const userId = get().user?.id
    if (!userId || !await ensureCaseDataConsent(userId)) throw new Error('尚未同意案件资料处理，可查看隐私说明后再试')
    if (isStale(context)) throw new Error('案件已切换，请重新生成')
    set({ isGeneratingReport: true, reportRunError: null })
    try {
      const result = await api.generateReport(currentCase.id, facts)
      if (isStale(context)) return
      if (isPendingReport(result)) {
        set({ reportRunId: result.runId, reportRunStatus: result.status, isGeneratingReport: ['queued','running'].includes(result.status), currentReport: null })
        return
      }
      const report = 'report' in result ? result.report : result
      set(state => ({
        currentReport: report,
        reportRunId: null,
        reportRunStatus: null,
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
    set({ ...createInitialState(null), uploadingFiles: new Map() })
  }
}))

export function __getCaseSessionForTests(): { activeCaseId: string | null; epoch: number } {
  return requestGuard.getSnapshot()
}
