import express from 'express'
import { memoryDB } from '../db/memory'

const router = express.Router()

// 获取或创建对话
router.post('/current', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    // 获取当前活跃案件
    const currentCase = await memoryDB.findActiveCase(userId)
    const caseId = currentCase?.id

    // 查找或创建对话
    const conversation = await memoryDB.findOrCreateConversation(userId, caseId)

    res.json({ success: true, data: conversation })
  } catch (err) {
    console.error('获取对话错误:', err)
    res.status(500).json({ success: false, error: '获取对话失败' })
  }
})

// 发送消息（带 Agent 处理）
router.post('/current/messages', async (req, res) => {
  try {
    const userId = req.userId
    const { text, images, materialType } = req.body

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    // 获取或创建对话
    const conversation = await memoryDB.findOrCreateConversation(userId)

    // 保存用户消息
    await memoryDB.createMessage(
      conversation.id,
      'user',
      'text',
      text,
      images ? { images, materialType } : undefined
    )

    let assistantText = ''
    let quickReplies: any[] = []

    // 如果用户上传了图片材料
    if (images && images.length > 0) {
      try {
        const { processMaterial } = await import('../services/agent')

        // 处理第一张图片（暂时只处理单张）
        const result = await processMaterial(materialType || 'police-report', images[0])

        // 构造确认消息
        const fieldsSummary = result.fields
          .map((f) => `• ${f.label}: ${f.value}`)
          .join('\n')

        assistantText = `我已识别出以下信息：\n\n${fieldsSummary}\n\n请确认这些信息是否正确？`

        quickReplies = [
          { label: '✅ 信息正确', value: 'confirm:correct' },
          { label: '✏️ 需要修改', value: 'confirm:edit' },
        ]

        // 保存识别结果到案件
        const currentCase = await memoryDB.findActiveCase(userId)
        if (currentCase) {
          await memoryDB.updateCase(userId, {
            materialCount: (currentCase.materialCount || 0) + 1,
          })
        }
      } catch (err: any) {
        console.error('材料处理失败:', err)
        assistantText = '抱歉，材料识别遇到问题，请稍后重试或手动输入信息。'
      }
    } else if (text) {
      // 纯文本消息处理
      if (text.includes('全责') || text.includes('责任')) {
        assistantText = '收到责任信息。是否还有人员受伤？'
        quickReplies = [
          { label: '没有受伤', value: 'casualties:无' },
          { label: '有人受伤', value: 'casualties:有' },
        ]
      } else {
        assistantText = '收到您的消息，请继续上传相关材料。'
      }
    } else {
      assistantText = '您好，请上传事故相关材料，我会帮您分析。'
    }

    // 保存 Agent 回复
    await memoryDB.createMessage(
      conversation.id,
      'assistant',
      'text',
      assistantText,
      quickReplies.length > 0 ? { quickReplies } : undefined
    )

    res.json({
      success: true,
      data: {
        message: assistantText,
        quickReplies,
      },
    })
  } catch (err) {
    console.error('发送消息错误:', err)
    res.status(500).json({ success: false, error: '发送消息失败' })
  }
})

// 获取消息历史
router.get('/current/messages', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    // 获取或创建对话
    const conversation = await memoryDB.findOrCreateConversation(userId)

    // 获取消息
    const messages = await memoryDB.getMessages(conversation.id)

    res.json({ success: true, data: messages })
  } catch (err) {
    console.error('获取消息错误:', err)
    res.status(500).json({ success: false, error: '获取消息失败' })
  }
})

export default router
