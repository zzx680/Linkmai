import axios from 'axios'
import { StringDecoder } from 'node:string_decoder'
import type { Readable } from 'node:stream'
import { config } from '../config'

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | DeepSeekContent[]
}

interface DeepSeekContent {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string
  }
}

interface DeepSeekResponse {
  choices: Array<{
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * 调用 DeepSeek Chat API（支持文本和图片）
 */
export async function callDeepSeek(
  messages: DeepSeekMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
  }
): Promise<DeepSeekResponse> {
  const response = await axios.post(
    `${config.deepseek.apiUrl}/chat/completions`,
    {
      model: config.deepseek.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
    },
    {
      timeout: Math.min(config.deepseek.timeoutMs, options?.timeoutMs ?? config.deepseek.timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.deepseek.apiKey}`,
      },
    }
  )

  return response.data
}

/**
 * 流式调用 DeepSeek Chat API。只把正文增量交给上层，完整文本仍由调用方负责提交。
 */
export async function streamDeepSeek(
  messages: DeepSeekMessage[],
  onDelta: (delta: string) => void,
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<string> {
  const timeoutMs = Math.min(config.deepseek.timeoutMs, options?.timeoutMs ?? config.deepseek.timeoutMs)
  const controller = new AbortController()
  // Bound the whole generation, including a provider that keeps sending keepalives.
  const deadline = setTimeout(() => controller.abort(), timeoutMs)
  let upstream: Readable | undefined
  try {
    const response = await axios.post(
      `${config.deepseek.apiUrl}/chat/completions`,
      {
        model: config.deepseek.model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
        stream: true,
      },
      {
        responseType: 'stream',
        timeout: timeoutMs,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deepseek.apiKey}` },
      }
    )

    upstream = response.data
    const decoder = new StringDecoder('utf8')
    let buffer = ''
    let content = ''
    let completed = false
    let stopped = false
    const consume = (line: string) => {
      if (!line.startsWith('data:')) return
      const data = line.slice(5).trim()
      if (!data) return
      if (data === '[DONE]') { completed = true; return }
      const event = JSON.parse(data)
      if (event.error) throw new Error('MODEL_UNAVAILABLE')
      const choice = event.choices?.[0]
      if (choice?.finish_reason) {
        if (choice.finish_reason !== 'stop') throw new Error('MODEL_UNAVAILABLE')
        stopped = true
      }
      const delta = choice?.delta?.content
      if (typeof delta === 'string' && delta) {
        content += delta
        if (content.length > 100_000) throw new Error('MODEL_UNAVAILABLE')
        onDelta(delta)
      }
    }
    for await (const chunk of response.data as AsyncIterable<Buffer | string>) {
      buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk)
      if (buffer.length > 1_000_000) throw new Error('MODEL_UNAVAILABLE')
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, '')
        buffer = buffer.slice(end + 1)
        consume(line)
        if (completed) break
      }
      if (completed) break
    }
    if (!completed || !stopped || !content.trim()) throw new Error('MODEL_UNAVAILABLE')
    return content
  } finally {
    clearTimeout(deadline)
    upstream?.destroy?.()
  }
}

/**
 * 分析事故图片
 */
export async function analyzeAccidentImage(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content:
        '你是一个专业的交通事故分析专家，擅长通过图片识别车辆损伤、碰撞角度、道路环境等信息。',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt,
        },
        {
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        },
      ],
    },
  ]

  const response = await callDeepSeek(messages)
  return response.choices[0].message.content
}

/**
 * 多轮对话（支持文本和图片混合）
 */
export async function chatWithAgent(
  conversationHistory: DeepSeekMessage[]
): Promise<string> {
  const systemMessage: DeepSeekMessage = {
    role: 'system',
    content: `你是"灵迈"交通事故处理助手，帮助用户：
1. 收集事故信息（时间、地点、过程、损伤）
2. 分析事故照片
3. 判断责任归属
4. 估算赔偿金额

引导用户提供必要信息，逐步完善案件细节。`,
  }

  const messages = [systemMessage, ...conversationHistory]
  const response = await callDeepSeek(messages)
  return response.choices[0].message.content
}

/**
 * 批量分析多张图片
 */
export async function analyzeMultipleImages(
  imageUrls: string[],
  prompt: string
): Promise<string> {
  const content: DeepSeekContent[] = [
    {
      type: 'text',
      text: prompt,
    },
    ...imageUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ]

  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: '你是交通事故分析专家，分析多张事故现场图片，给出综合判断。',
    },
    {
      role: 'user',
      content,
    },
  ]

  const response = await callDeepSeek(messages, { maxTokens: 3000 })
  return response.choices[0].message.content
}

/**
 * 通用文本分析（用于 Agent 服务）
 */
export async function analyzeWithDeepSeek(prompt: string): Promise<string> {
  const messages: DeepSeekMessage[] = [
    {
      role: 'user',
      content: prompt,
    },
  ]

  const response = await callDeepSeek(messages, { temperature: 0.3 })
  return response.choices[0].message.content
}

/**
 * 便捷函数：文本 prompt（可附带图片）
 */
export async function analyzeText(prompt: string, imageUrls: string[] = []): Promise<string> {
  if (imageUrls.length === 0) {
    return analyzeWithDeepSeek(prompt)
  }

  const content: DeepSeekContent[] = [
    { type: 'text', text: prompt },
    ...imageUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ]

  const messages: DeepSeekMessage[] = [
    {
      role: 'user',
      content,
    },
  ]

  const response = await callDeepSeek(messages, { temperature: 0.3 })
  return response.choices[0].message.content
}
