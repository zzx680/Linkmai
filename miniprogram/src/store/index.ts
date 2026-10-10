import { create } from 'zustand'
import * as api from '../services/api'
import Taro from '@tarojs/taro'

interface AppState {
  user: api.User | null
  token: string | null
  isLoggedIn: boolean
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
  loadCurrentCase: () => Promise<void>
  createCase: () => Promise<void>
  updateCase: (updates: Partial<api.Case>) => Promise<void>
  loadMessages: () => Promise<void>
  sendMessage: (content: string, images?: string[], materialType?: api.MaterialType) => Promise<void>
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
  currentCase: null,
  isLoadingCase: false,
  messages: [],
  conversationState: 'collecting' as api.ConversationState,
  isAiTyping: false,
  materials: [],
  uploadingFiles: new Map<string, number>(),
  currentReport: null,
  isGeneratingReport: false
}

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  login: async (code) => {
    const result = await api.login(code)
    set({
      token: result.token,
      isLoggedIn: true,
      user: result.user
    })
  },

  logout: () => {
    api.logout()
    set({
      ...initialState,
      token: null,
      isLoggedIn: false,
      uploadingFiles: new Map()
    })
  },

  checkLoginStatus: async () => {
    const restoreSession = async () => {
      const loginResult = await Taro.login()
      if (!loginResult.code) return false
      await get().login(loginResult.code)
      return true
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
            set({ isLoggedIn: false })
            return false
          }
        }
      } else if (!await restoreSession()) {
        set({ isLoggedIn: false })
        return false
      }

      await get().loadCurrentCase()
      await get().loadMessages()
      return true
    } catch (error) {
      console.error('Login restore error:', error)
      api.clearToken()
      set({ user: null, token: null, isLoggedIn: false })
      return false
    }
  },

  loadCurrentCase: async () => {
    set({ isLoadingCase: true, currentReport: null, materials: [], messages: [] })
    try {
      const currentCase = await api.getCurrentCase()
      set({ currentCase, isLoadingCase: false })
      if (currentCase) {
        const materials = await api.getMaterials(currentCase.id)
        set({ materials })
      } else {
        set({ materials: [] })
      }
    } catch (error) {
      set({ currentCase: null, materials: [], isLoadingCase: false })
      console.error('Load case error:', error)
    }
  },

  createCase: async () => {
    try {
      const currentCase = await api.createCase()
      set({ currentCase })
    } catch (error: any) {
      Taro.showToast({ title: error.message || '创建案件失败', icon: 'none' })
      throw error
    }
  },

  updateCase: async (updates) => {
    const currentCase = await api.updateCase(updates)
    set({ currentCase })
  },

  loadMessages: async () => {
    const history = await api.getConversationHistory()
    set({
      messages: history.messages,
      conversationState: history.conversationState || history.agentState?.stage || 'collecting'
    })
  },

  sendMessage: async (content, images, materialType) => {
    const temporaryMessage: api.Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      images,
      timestamp: new Date().toISOString()
    }

    set(state => ({
      messages: [...state.messages, temporaryMessage],
      isAiTyping: true
    }))

    try {
      const response = await api.sendMessage(content, images, materialType)
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
    } catch (error: any) {
      set(state => ({
        messages: state.messages.filter(message => message.id !== temporaryMessage.id),
        isAiTyping: false
      }))
      Taro.showToast({ title: error.message || '发送失败', icon: 'none' })
      throw error
    }
  },

  setAiTyping: (typing) => set({ isAiTyping: typing }),

  uploadImage: async (filePath) => {
    const fileId = `upload-${Date.now()}`
    get().setUploadProgress(fileId, 10)
    try {
      const result = await api.uploadImage(filePath)
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
    const material = await api.processMaterial(type, artifactId, get().currentCase?.id)
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
    set(state => ({ materials: [...state.materials, material] }))
  },

  confirmMaterial: async (materialId, fields) => {
    const material = get().materials.find(item => item.id === materialId)
    const currentCase = get().currentCase
    if (!material || !currentCase) return

    const result = await api.confirmMaterial(
      currentCase.id,
      material.id,
      fields,
      material.rawText
    )
    const confirmedMaterial = result.material || { ...material, fields, confirmed: result.confirmed }
    set(state => ({
      materials: state.materials.map(item => item.id === materialId ? confirmedMaterial : item)
    }))
    await get().loadCurrentCase()
  },

  generateReport: async () => {
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

    set({ isGeneratingReport: true })
    try {
      const report = await api.generateReport(facts)
      set({ currentReport: report, isGeneratingReport: false })
      if (get().currentCase) {
        set(state => ({
          currentCase: state.currentCase ? { ...state.currentCase, hasReport: true } : null
        }))
      }
    } catch (error: any) {
      set({ isGeneratingReport: false })
      Taro.showToast({ title: error.message || '报告生成失败', icon: 'none' })
      throw error
    }
  },

  loadReport: async (caseId) => {
    const report = await api.getReport(caseId)
    if (report?.caseId === caseId) {
      set({ currentReport: report })
    }
  },

  reset: () => set({ ...initialState, uploadingFiles: new Map() })
}))
