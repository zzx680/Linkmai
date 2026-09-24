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
  uploadImage: (filePath: string) => Promise<string>
  processMaterial: (type: api.MaterialType, imageUrl: string) => Promise<api.Material>
  setUploadProgress: (fileId: string, progress: number) => void
  addMaterial: (material: api.Material) => void
  confirmMaterial: (materialId: string, fields: api.MaterialField[]) => void
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
    const token = api.getToken()
    if (!token) {
      set({ isLoggedIn: false })
      return false
    }
    set({ token, isLoggedIn: true })
    await get().loadCurrentCase()
    return true
  },

  loadCurrentCase: async () => {
    set({ isLoadingCase: true })
    try {
      const currentCase = await api.getCurrentCase()
      set({ currentCase, isLoadingCase: false })
    } catch (error) {
      set({ currentCase: null, isLoadingCase: false })
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
      return result.url
    } catch (error) {
      set(state => {
        const uploadingFiles = new Map(state.uploadingFiles)
        uploadingFiles.delete(fileId)
        return { uploadingFiles }
      })
      throw error
    }
  },

  processMaterial: async (type, imageUrl) => {
    const result = await api.processMaterial(type, imageUrl)
    const material: api.Material = {
      id: `material-${Date.now()}`,
      caseId: get().currentCase?.id,
      type: result.type,
      imageUrl,
      fields: result.fields || [],
      rawText: result.rawText,
      status: 'processed',
      confirmed: false,
      createdAt: new Date().toISOString()
    }
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

  confirmMaterial: (materialId, fields) => {
    const material = get().materials.find(m => m.id === materialId)
    if (!material || !get().currentCase) return

    set(state => ({
      materials: state.materials.map(m =>
        m.id === materialId ? { ...m, fields, confirmed: true } : m
      )
    }))

    // 持久化到后端
    api.confirmMaterial(
      get().currentCase!.id,
      material.type,
      material.imageUrl,
      fields,
      material.rawText
    ).catch(err => {
      console.error('Failed to persist material confirmation:', err)
    })
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
    const result = await api.getReport(caseId)
    if (result?.analysis || result?.report) {
      set({ currentReport: result.report || result })
    }
  },

  reset: () => set({ ...initialState, uploadingFiles: new Map() })
}))
