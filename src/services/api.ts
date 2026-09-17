import Taro from '@tarojs/taro'
import { Artifact, ChatMessage, CurrentCase, ReportSummary } from '../types/domain'

// 根据环境自动切换 API 地址
function getApiBase(): string {
  const accountInfo = Taro.getAccountInfoSync()
  const envVersion = accountInfo.miniProgram.envVersion

  if (envVersion === 'release') {
    // 正式版
    return 'https://api.linkmai.com/api/v1'
  } else if (envVersion === 'trial') {
    // 体验版
    return 'https://api.linkmai.com/api/v1'
  } else {
    // 开发版 - 使用本地服务器
    return 'http://localhost:8000/api/v1'
  }
}

export const API_BASE = getApiBase()

export interface AgentMessageResponse {
  message: ChatMessage
  report?: ReportSummary
  currentCase?: CurrentCase
}

export async function createCurrentCase(): Promise<CurrentCase> {
  const res = await Taro.request({
    url: `${API_BASE}/cases`,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
    },
  })
  return res.data as CurrentCase
}

export async function uploadArtifact(artifact: Artifact): Promise<Artifact> {
  if (artifact.type === 'image' && artifact.localPath) {
    const res = await Taro.uploadFile({
      url: `${API_BASE}/artifacts/upload`,
      filePath: artifact.localPath,
      name: 'file',
      formData: {
        type: artifact.type,
        fieldKey: artifact.fieldKey || '',
      },
    })
    return JSON.parse(res.data) as Artifact
  }

  const res = await Taro.request({
    url: `${API_BASE}/artifacts`,
    method: 'POST',
    data: artifact,
  })
  return res.data as Artifact
}

export async function sendAgentMessage(
  message: ChatMessage,
): Promise<AgentMessageResponse> {
  const res = await Taro.request({
    url: `${API_BASE}/agent/message`,
    method: 'POST',
    data: message,
  })
  return res.data as AgentMessageResponse
}
