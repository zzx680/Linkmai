import Taro from '@tarojs/taro'
import { getApiBase } from '../config/env'
import { getToken } from '../services/api'

const API_BASE = getApiBase()

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  timestamp: number
}

export interface AgentResponse {
  message: string
  nextAction?: 'collect_media' | 'analyze' | 'generate'
  suggestions?: string[]
}

export async function sendMessage(
  conversationId: string,
  content: string,
  images?: string[]
): Promise<AgentResponse> {
  const token = getToken()
  const response = await Taro.request({
    url: `${API_BASE}/conversations/current/messages`,
    method: 'POST',
    header: token ? { Authorization: `Bearer ${token}` } : {},
    data: {
      text: content,
      images
    }
  })

  if (response.statusCode !== 200) {
    throw new Error('Failed to send message')
  }

  return response.data
}

export async function createConversation(): Promise<string> {
  const token = getToken()
  const response = await Taro.request({
    url: `${API_BASE}/conversations/current`,
    method: 'POST',
    header: token ? { Authorization: `Bearer ${token}` } : {}
  })

  if (response.statusCode !== 200) {
    throw new Error('Failed to create conversation')
  }

  return response.data?.data?.id || response.data?.id
}
