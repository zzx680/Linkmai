import { randomUUID } from 'node:crypto'
import { safeError } from '../utils/safe-error'
import express from 'express'
import { db } from '../db'
import { normalizeAgentAction, processUserMessage, type AgentMaterial, type AgentState } from '../services/agent'
import { conversationText, interpretUserMessage } from '../services/agent-language'
import { conversationHash, type ConversationSnapshot } from '../db/conversation'
import { caseAgentFactKeys, reportReadiness, type CaseAgentContext } from '../harness/case-agent'
import { harness } from '../harness/service'

const router = express.Router()
const persistence = db as typeof db & Record<string, any>

type Readiness = Omit<ReturnType<typeof reportReadiness>, 'pending'> & {
  pending: number
  canGenerate: boolean
  reportExists: boolean
  reportStale: boolean
}

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
  return { stage: 'collecting', collectedFacts: [], quickReplies: [] }
}

function readiness(state: AgentState, context: CaseAgentContext): Readiness {
  const status = reportReadiness(state)
  const conflictsOpen = context.workspace?.conflicts.some(conflict => conflict.status === 'open') || false
  return {
    ...status, pending: status.pending.length, canGenerate: status.factsReady && !conflictsOpen,
    reportExists: context.report.exists, reportStale: context.report.stale,
  }
}

async function caseContext(userId: string, snapshot: any, workspace?: Awaited<ReturnType<typeof harness.get>>): Promise<CaseAgentContext> {
  const caseData = snapshot.caseData
  if (workspace && workspace.revision !== snapshot.inputRevision) throw new Error('CONVERSATION_STALE')
  const report = workspace ? undefined : await db.getReportByCase(caseData.id)
  const reportExists = workspace
    ? workspace.documents.some(document => document.type === 'case_report')
    : Boolean(report)
  const reportStale = workspace
    ? reportExists && !workspace.documents.some(document => document.type === 'case_report' && document.contextHash === workspace.contextHash && !['stale', 'superseded'].includes(document.status))
    : reportExists && (!caseData.hasReport || report?.inputRevision !== snapshot.inputRevision)
  return {
    caseId: caseData.id, inputRevision: snapshot.inputRevision,
    facts: snapshot.agentState.collectedFacts,
    materials: (snapshot.artifacts || []).map((artifact: any) => ({
      id: artifact.id, type: artifact.type, status: artifact.status, confirmed: artifact.metadata?.confirmed === true,
    })),
    report: { exists: reportExists, stale: reportStale },
    recentMessages: (snapshot.recentMessages || []).map((message: any) => ({
      role: message.role,
      text: conversationText(typeof message.text === 'string' ? message.text : '', {
        action: typeof message.metadata?.action === 'string' ? normalizeAgentAction(message.metadata.action) : undefined,
        attachedMaterials: (message.metadata?.artifactIds || []).map((id: string) => ({ id, type: 'other', confirmed: false })),
      }),
    })).filter((message: { text: string }) => message.text),
    ...(workspace ? { workspace: { revision: workspace.revision, workflow: workspace.workflow, conflicts: workspace.conflicts } } : {}),
  }
}

function safeErrorCode(error: unknown): string | undefined {
  return error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : undefined
}

router.get('/current', async (req, res) => {
  try {
    const caseData = await ownedCase(req, res, req.query.caseId)
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
    const requestId = req.body?.requestId === undefined ? randomUUID() : req.body.requestId
    const caseData = await ownedCase(req, res, caseId)
    if (!caseData) return
    if (images !== undefined || imageUrl !== undefined || url !== undefined) {
      return res.status(400).json({ success: false, error: '不接受图片 URL，请先上传材料并提供 artifactIds' })
    }
    if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 128 ||
      (text !== undefined && (typeof text !== 'string' || text.length > 10000)) ||
      !Array.isArray(artifactIds) || artifactIds.length > 20 || artifactIds.some(id => typeof id !== 'string' || !id.trim()) ||
      (action !== undefined && (typeof action !== 'string' || !(['confirm', 'edit', 'finish', 'upload', 'generate_report', 'manual_input'].includes(normalizeAgentAction(action)) || (action.startsWith('edit:') && caseAgentFactKeys.some(key => action === `edit:${key}`)))))) {
      return res.status(400).json({ success: false, error: '消息参数不合法' })
    }
    if (!text?.trim() && !action && artifactIds.length === 0) {
      return res.status(400).json({ success: false, error: '消息不能为空' })
    }

    const attachedIds: string[] = [...new Set<string>(artifactIds)]
    const materials: AgentMaterial[] = []
    for (const artifactId of attachedIds) {
      const artifact = await db.findArtifactById(caseData.id, artifactId)
      if (!artifact) return res.status(404).json({ success: false, error: '材料不存在或不属于该案件' })
      const extractedData: Record<string, unknown> = {}
      if (artifact.status === 'processed' && artifact.metadata?.confirmed === true) {
        for (const field of artifact.metadata.fields || []) extractedData[field.key] = field.value
      }
      materials.push({ type: artifact.type, artifactId, extractedData, confirmed: artifact.metadata?.confirmed === true })
    }

    const requestHash = conversationHash({ caseId, text: text || '', action: action ? normalizeAgentAction(action) : undefined, artifactIds: attachedIds })
    const replay = await persistence.findConversationTurnResult(req.userId!, caseData.id, requestId, requestHash)
    if (replay) {
      const workspace = process.env.HARNESS_ENABLED === 'true' ? await harness.get(req.userId!, caseData.id) : undefined
      const snapshot = await persistence.readConversationSnapshot(req.userId!, caseData.id)
      const context = await caseContext(req.userId!, snapshot, workspace)
      return res.json({ success: true, data: { ...replay, message: replay.assistantText, conversationState: replay.agentState.stage, readiness: readiness(snapshot.agentState, context) } })
    }

    const workspace = process.env.HARNESS_ENABLED === 'true' ? await harness.get(req.userId!, caseData.id) : undefined
    const snapshot: ConversationSnapshot & { agentState: AgentState; artifacts: any[]; recentMessages: any[] } =
      await persistence.readConversationSnapshot(req.userId!, caseData.id)
    const state = snapshot.agentState || initialState()
    const context = await caseContext(req.userId!, snapshot, workspace)
    const { agentState, assistantText } = await processUserMessage(state, text || '', materials, action, interpretUserMessage, context)
    const committed = await persistence.commitConversationTurn({
      userId: req.userId!, caseId: caseData.id, requestId, requestHash, text: conversationText(text || '', { action: action ? normalizeAgentAction(action) : undefined, attachedMaterials: materials.map(material => ({ type: material.type, confirmed: material.confirmed === true })) }),
      metadata: { ...(action ? { action: normalizeAgentAction(action) } : {}), ...(attachedIds.length ? { artifactIds: attachedIds } : {}) },
      expected: snapshot, agentState, assistantText,
    })
    const currentWorkspace = process.env.HARNESS_ENABLED === 'true' ? await harness.get(req.userId!, caseData.id) : undefined
    const currentSnapshot = await persistence.readConversationSnapshot(req.userId!, caseData.id)
    const currentContext = await caseContext(req.userId!, currentSnapshot, currentWorkspace)
    const data = { ...committed, message: committed.assistantText, conversationState: committed.agentState.stage, readiness: readiness(currentSnapshot.agentState, currentContext) }
    res.json({ success: true, data })
  } catch (err) {
    const code = safeErrorCode(err)
    if (code === 'MODEL_UNAVAILABLE') {
      return res.status(503).json({ success: false, error: '模型暂时不可用，请稍后重试', code })
    }
    if (code === 'CONVERSATION_STALE' || code === 'REQUEST_ID_CONFLICT') {
      return res.status(409).json({ success: false, error: code, code })
    }
    console.error('发送消息错误:', safeError(err))
    res.status(500).json({ success: false, error: '发送消息失败' })
  }
})

router.get('/current/messages', async (req, res) => {
  try {
    const caseData = await ownedCase(req, res, req.query.caseId)
    if (!caseData) return
    const workspace = process.env.HARNESS_ENABLED === 'true' ? await harness.get(req.userId!, caseData.id) : undefined
    const snapshot = await persistence.readConversationSnapshot(req.userId!, caseData.id)
    const agentState = snapshot.agentState || initialState()
    const messages = await db.getMessages(snapshot.conversationId)
    const context = await caseContext(req.userId!, snapshot, workspace)
    res.json({ success: true, data: { messages, agentState, conversationState: agentState.stage, readiness: readiness(agentState, context) } })
  } catch (err) {
    console.error('获取消息错误:', safeError(err))
    res.status(500).json({ success: false, error: '获取消息失败' })
  }
})

export default router
