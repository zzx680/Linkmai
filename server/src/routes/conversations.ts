import { safeError } from '../utils/safe-error'
import express from 'express'
import { db } from '../db'
import { generateNextQuestion, normalizeAgentAction, processUserMessage, type AgentMaterial, type AgentState } from '../services/agent'

const router = express.Router()

async function ownedCase(req: express.Request, res: express.Response, caseId: unknown) {
  if (!req.userId) {
    res.status(401).json({ success: false, error: '未认证' })
    return null
  }
  if (typeof caseId !== 'string' || !caseId.trim()) {
    res.status(400).json({ success: false, error: '请明确提供 caseId' })
    return null
  }
  const caseData = await db.findCaseById(req.userId, caseId)
  if (!caseData) res.status(404).json({ success: false, error: '案件不存在' })
  return caseData
}

function initialState(): AgentState {
  const state: AgentState = { stage: 'collecting', collectedFacts: [] }
  const next = generateNextQuestion(state)
  return { ...state, nextQuestion: next.question, quickReplies: next.quickReplies || [] }
}

router.post('/current', async (req, res) => {
  try {
    const caseData = await ownedCase(req, res, req.body?.caseId)
    if (!caseData) return
    const conversation = await db.findOrCreateConversation(req.userId!, caseData.id)
    res.json({ success: true, data: conversation })
  } catch (err) {
    console.error('获取对话错误:', safeError(err))
    res.status(500).json({ success: false, error: '获取对话失败' })
  }
})

router.post('/current/messages', async (req, res) => {
  try {
    const { caseId, text, action, artifactIds = [], images, imageUrl, url } = req.body || {}
    const caseData = await ownedCase(req, res, caseId)
    if (!caseData) return
    // 只接收本案件已上传材料的 ID；识别、核对、确认由 materials 流程负责。
    if (images !== undefined || imageUrl !== undefined || url !== undefined) {
      return res.status(400).json({ success: false, error: '不接受图片 URL，请先上传材料并提供 artifactIds' })
    }
    if ((text !== undefined && (typeof text !== 'string' || text.length > 10000)) ||
        !Array.isArray(artifactIds) || artifactIds.length > 20 || artifactIds.some(id => typeof id !== 'string' || !id.trim()) ||
        (action !== undefined && (typeof action !== 'string' || !/^(confirm|edit|finish|upload|generate_report|manual_input|confirm:correct|confirm:edit|no_more_materials|edit:(accident_type|accident_date|accident_location|parties_involved|accident_description|liability))$/.test(action)))) {
      return res.status(400).json({ success: false, error: '消息参数不合法' })
    }
    if (!text?.trim() && !action && artifactIds.length === 0) {
      return res.status(400).json({ success: false, error: '消息不能为空' })
    }

    const materials: AgentMaterial[] = []
    const attachedIds: string[] = [...new Set<string>(artifactIds)]
    for (const artifactId of attachedIds) {
      const artifact = await db.findArtifactById(caseData.id, artifactId)
      if (!artifact) return res.status(404).json({ success: false, error: '材料不存在或不属于该案件' })
      const extractedData: Record<string, unknown> = {}
      // 不把未经核对的识别字段变成对话事实，也不在对话中重复调用收费识别 API。
      if (artifact.status === 'processed' && artifact.metadata?.confirmed === true) {
        for (const field of artifact.metadata.fields || []) extractedData[field.key] = field.value
      }
      materials.push({ type: artifact.type, artifactId, extractedData, confirmed: artifact.metadata?.confirmed === true })
    }

    const conversation = await db.findOrCreateConversation(req.userId!, caseData.id)
    const newState = await processUserMessage(conversation.agentState || initialState(), text || '', materials, action)
    if (attachedIds.length && materials.every(material => !Object.keys(material.extractedData || {}).length)) {
      newState.nextQuestion = `材料已附加到对话。请在材料页面完成识别、核对和确认。\n${newState.nextQuestion}`
    }
    await db.createMessage(conversation.id, 'user', 'text', text || '', {
      ...(action ? { action: normalizeAgentAction(action) } : {}),
      ...(attachedIds.length ? { artifactIds: attachedIds } : {}),
    })
    await db.updateConversationState(conversation.id, newState)
    const assistantText = newState.nextQuestion || '好的，我已记录。'
    const quickReplies = newState.quickReplies || []
    await db.createMessage(conversation.id, 'assistant', 'text', assistantText, { quickReplies })
    res.json({ success: true, data: { message: assistantText, quickReplies, agentState: newState, conversationState: newState.stage } })
  } catch (err) {
    console.error('发送消息错误:', safeError(err))
    res.status(500).json({ success: false, error: '发送消息失败' })
  }
})

router.get('/current/messages', async (req, res) => {
  try {
    const caseData = await ownedCase(req, res, req.query.caseId)
    if (!caseData) return
    const conversation = await db.findOrCreateConversation(req.userId!, caseData.id)
    const messages = await db.getMessages(conversation.id)
    const agentState = conversation.agentState || initialState()
    res.json({ success: true, data: { messages, agentState, conversationState: agentState.stage } })
  } catch (err) {
    console.error('获取消息错误:', safeError(err))
    res.status(500).json({ success: false, error: '获取消息失败' })
  }
})

export default router
