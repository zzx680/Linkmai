import axios from 'axios'

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

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
  }
): Promise<DeepSeekResponse> {
  const response = await axios.post(
    `${DEEPSEEK_BASE_URL}/chat/completions`,
    {
      model: 'deepseek-flash',
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
    }
  )

  return response.data
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
