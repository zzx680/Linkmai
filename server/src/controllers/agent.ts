import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'

interface Conversation {
  id: string
  state: 'INIT' | 'COLLECT_BASIC' | 'COLLECT_MEDIA' | 'ANALYZE' | 'CLARIFY' | 'GENERATE' | 'COMPLETE'
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    images?: string[]
    timestamp: number
  }>
  context: {
    hasPoliceReport?: boolean
    hasMedicalRecords?: boolean
    hasVehicleDamage?: boolean
    accidentDescription?: string
    images: string[]
  }
  createdAt: number
  updatedAt: number
}

const conversations = new Map<string, Conversation>()

export function createConversation(req: Request, res: Response) {
  const conversationId = uuidv4()

  const conversation: Conversation = {
    id: conversationId,
    state: 'INIT',
    messages: [],
    context: {
      images: []
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  conversations.set(conversationId, conversation)

  res.json({ conversationId })
}

export async function handleMessage(req: Request, res: Response) {
  const { conversationId, content, images } = req.body

  const conversation = conversations.get(conversationId)

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' })
  }

  // 保存用户消息
  conversation.messages.push({
    role: 'user',
    content,
    images,
    timestamp: Date.now()
  })

  if (images && images.length > 0) {
    conversation.context.images.push(...images)
  }

  // 状态机逻辑
  let responseMessage = ''
  let nextAction = null

  switch (conversation.state) {
    case 'INIT':
      // 初始状态，引导用户提供材料
      if (content.includes('交警认定书') || content.includes('认定书')) {
        conversation.context.hasPoliceReport = true
        responseMessage = '收到。请拍照上传交警事故认定书的所有页面。'
        conversation.state = 'COLLECT_MEDIA'
        nextAction = 'collect_media'
      } else if (content.includes('医疗') || content.includes('受伤')) {
        conversation.context.hasMedicalRecords = true
        responseMessage = '收到。请上传医疗费用票据、诊断证明等材料。'
        conversation.state = 'COLLECT_MEDIA'
        nextAction = 'collect_media'
      } else if (content.includes('车损') || content.includes('维修')) {
        conversation.context.hasVehicleDamage = true
        responseMessage = '收到。请上传车辆损伤照片和维修报价单。'
        conversation.state = 'COLLECT_MEDIA'
        nextAction = 'collect_media'
      } else if (content.includes('没有材料') || content.includes('没有')) {
        responseMessage = '没关系，请描述一下事故经过：时间、地点、双方车辆情况、碰撞过程。'
        conversation.state = 'COLLECT_BASIC'
      } else {
        responseMessage = '你好！我需要了解事故情况。请选择：\n\n1. 上传交警认定书\n2. 上传医疗材料\n3. 上传车损材料\n4. 我没有材料，口述事故经过'
      }
      break

    case 'COLLECT_BASIC':
      // 收集基本信息
      conversation.context.accidentDescription = content
      responseMessage = '信息已记录。如果有现场照片、行车记录仪视频等材料，可以上传补充。或者直接说"开始分析"。'
      conversation.state = 'COLLECT_MEDIA'
      nextAction = 'collect_media'
      break

    case 'COLLECT_MEDIA':
      // 收集图片和材料
      if (content.includes('开始分析') || content.includes('分析') || images?.length > 0) {
        responseMessage = '材料已收到，正在分析中...'
        conversation.state = 'ANALYZE'
        nextAction = 'analyze'

        // 这里会调用 DeepSeek 分析
        setTimeout(() => {
          conversation.messages.push({
            role: 'assistant',
            content: '分析完成！根据你提供的材料，初步判断：\n\n**责任认定**\n对方负主要责任（70%），你负次要责任（30%）\n\n**赔偿估算**\n• 车辆维修费：约 ¥8,500\n• 医疗费用：约 ¥3,200\n• 误工费：约 ¥1,800\n\n详细报告生成中...',
            timestamp: Date.now()
          })
          conversation.state = 'GENERATE'
        }, 2000)
      } else {
        responseMessage = '继续上传材料，或者说"开始分析"。'
      }
      break

    case 'ANALYZE':
      responseMessage = '正在分析，请稍候...'
      break

    case 'GENERATE':
      responseMessage = '报告已生成。需要律师协助吗？'
      conversation.state = 'COMPLETE'
      break

    case 'COMPLETE':
      responseMessage = '如需帮助，请切换到"咨询"页面联系律师。'
      break
  }

  // 保存助手回复
  conversation.messages.push({
    role: 'assistant',
    content: responseMessage,
    timestamp: Date.now()
  })

  conversation.updatedAt = Date.now()

  res.json({
    message: responseMessage,
    nextAction
  })
}

export function getConversation(req: Request, res: Response) {
  const { conversationId } = req.params

  const conversation = conversations.get(conversationId)

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' })
  }

  res.json(conversation)
}
