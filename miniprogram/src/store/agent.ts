import { create } from 'zustand'
import { Message } from '../utils/agent'

interface AgentStore {
  conversationId: string | null
  messages: Message[]
  isLoading: boolean

  setConversationId: (id: string) => void
  addMessage: (message: Message) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  conversationId: null,
  messages: [],
  isLoading: false,

  setConversationId: (id) => set({ conversationId: id }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  clearMessages: () => set({ messages: [] })
}))
