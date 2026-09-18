import express from 'express'
import { db } from '../db'

const router = express.Router()

// 获取或创建对话
router.post('/current', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    // 获取当前活跃案件
    const currentCase = await db.findActiveCase(userId)
    const caseId = currentCase?.id

    // 查找或创建对话
    const conversation = await db.findOrCreateConversation(userId, caseId)

    res.json({ success: true, data: conversation })
  } catch (err) {
    console.error('获取对话错误:', err)
    res.status(500).json({ success: false, error: '获取对话失败' })
  }
})

// 发送消息（带 Agent 状态管理）
router.post('/current/messages', async (req, res) => {
  try {
    const userId = req.userId
    const { text, images, materialType } = req.body

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    // 获取或创建对话
    const conversation = await db.findOrCreateConversation(userId)
    const agentState = conversation.agentState || {
      stage: 'collecting',
      collectedFacts: [],
      nextQuestion: '您好！我是灵迈事故理赔助手。请问您遇到了什么类型的事故？',
    }

    // 保存用户消息
    await db.createMessage(
      conversation.id,
      'user',
      'text',
      text,
      images ? { images, materialType } : undefined
    )

    let materials: Array<{ type: string; url: string; extractedData?: any }> = []

    // 如果用户上传了图片材料
    if (images && images.length > 0) {
      try {
        const { processMaterial } = await import('../services/material')

        // 处理材料并提取数据
        for (const imageUrl of images) {
          const result = await processMaterial(materialType || 'police-report', imageUrl)

          // 将字段转换为结构化数据
          const extractedData: any = {}
          result.fields.forEach((f: any) => {
            extractedData[f.key] = f.value
          })

          materials.push({
            type: materialType || 'image',
            url: imageUrl,
            extractedData,
          })
        }

        // 更新案件材料计数
        const currentCase = await db.findActiveCase(userId)
        if (currentCase) {
          await db.updateCase(userId, {
            materialCount: (currentCase.materialCount || 0) + images.length,
          })
        }
      } catch (err: any) {
        console.error('材料处理失败:', err)
      }
    }

    // 使用 Agent 状态管理更新对话
    const { processUserMessage } = await import('../services/agent')
    const newState = await processUserMessage(agentState, text || '', materials)

    // 保存更新后的状态
    await db.updateConversationState(conversation.id, newState)

    // 构造回复消息
    let assistantText = newState.nextQuestion || '好的，我已记录。'
    const quickReplies = newState.quickReplies || []

    // 如果有待确认的信息，展示确认消息
    if (materials.length > 0) {
      const unconfirmedFacts = newState.collectedFacts.filter(f => !f.confirmed)
      if (unconfirmedFacts.length > 0) {
        const fieldsSummary = unconfirmedFacts
          .map((f) => `• ${f.label}: ${f.value}`)
          .join('\n')

        assistantText = `我已识别出以下信息：\n\n${fieldsSummary}\n\n请确认这些信息是否正确？`
        quickReplies.push(
          { label: '✅ 信息正确', value: 'confirm:correct', action: 'confirm' },
          { label: '✏️ 需要修改', value: 'confirm:edit', action: 'edit' }
        )
      }
    }

    // 保存 Agent 回复
    await db.createMessage(
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
        agentState: {
          stage: newState.stage,
          collectedFactsCount: newState.collectedFacts.length,
        },
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
    const conversation = await db.findOrCreateConversation(userId)

    // 获取消息
    const messages = await db.getMessages(conversation.id)

    res.json({ success: true, data: messages })
  } catch (err) {
    console.error('获取消息错误:', err)
    res.status(500).json({ success: false, error: '获取消息失败' })
  }
})

export default router
