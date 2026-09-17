import Taro from '@tarojs/taro'

const SERVER_URL = 'http://localhost:3000'

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
  const response = await Taro.request({
    url: `${SERVER_URL}/api/agent/message`,
    method: 'POST',
    data: {
      conversationId,
      content,
      images
    }
  })

  if (response.statusCode !== 200) {
    throw new Error('Failed to send message')
  }

  return response.data
}

export async function createConversation(): Promise<string> {
  const response = await Taro.request({
    url: `${SERVER_URL}/api/agent/conversation`,
    method: 'POST'
  })

  if (response.statusCode !== 200) {
    throw new Error('Failed to create conversation')
  }

  return response.data.conversationId
}

export function startVoiceRecording(): Promise<string> {
  return new Promise((resolve, reject) => {
    const recorderManager = Taro.getRecorderManager()

    recorderManager.onStop((res) => {
      resolve(res.tempFilePath)
    })

    recorderManager.onError((err) => {
      reject(err)
    })

    recorderManager.start({
      duration: 60000,
      format: 'mp3'
    })
  })
}

export function voiceToText(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.getRecorderManager().onFrameRecorded((res) => {
      // 微信内置语音识别
      wx.startRecognition({
        lang: 'zh_CN',
        success: (result) => {
          resolve(result.result)
        },
        fail: reject
      })
    })
  })
}
