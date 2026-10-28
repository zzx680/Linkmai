import { safeError } from '../utils/safe-error'
import { Router } from 'express'
import { db } from '../db'
import { generateReport, CASE_REPORT_SKILL_VERSION } from '../services/report'
import { buildLegalSearchInput } from '../services/legal-retrieval'
import { ensureCoreTrafficLegalCorpus } from '../services/legal-corpus'
import { CollectedFact } from '../services/agent'
import { requirePaidEntitlement } from '../services/payment'
import { materialSnapshot } from '../services/material-snapshot'
import { harness } from '../harness/service'
import { createReportNotificationSubscription, deliverReportNotificationForRun, linkReportNotificationToRun, reportNotificationConfig } from '../services/report-notifications'

const router = Router()

router.get('/notification-config', (_req, res) => {
  res.json({ success: true, data: reportNotificationConfig() })
})

router.post('/notification-subscriptions', async (req, res) => {
  const userId = req.userId
  const caseId = req.body?.caseId
  if (!userId) return res.status(401).json({ success: false, error: '未认证' })
  if (typeof caseId !== 'string' || !caseId) return res.status(400).json({ success: false, error: '缺少案件编号' })
  try {
    if (!await db.findCaseById(userId, caseId)) return res.status(404).json({ success: false, error: '未找到案件' })
    const data = await createReportNotificationSubscription(userId, caseId)
    return res.json({ success: true, data })
  } catch (error) {
    if ((error as Error).message === 'REPORT_NOTIFICATION_DISABLED') {
      return res.status(503).json({ success: false, error: '完成提醒暂未配置' })
    }
    console.error('案件提醒授权保存失败:', safeError(error))
    return res.status(500).json({ success: false, error: '提醒授权暂未保存，请稍后重试' })
  }
})

/**
 * POST /api/reports/generate
 * 生成事故分析报告
 */
router.post('/generate', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    const caseId = req.body.caseId
    const notificationSubscriptionId = typeof req.body.notificationSubscriptionId === 'string'
      && req.body.notificationSubscriptionId.length <= 64 ? req.body.notificationSubscriptionId : undefined
    if (typeof caseId !== 'string' || !caseId) return res.status(400).json({ success: false, error: '缺少案件编号' })
    const currentCase = await db.findCaseById(userId, caseId)
    if (!currentCase) {
      return res.status(404).json({ success: false, error: '未找到活跃案件' })
    }
    if (process.env.HARNESS_ENABLED === 'true') {
      const run = await harness.enqueue(userId, currentCase.id)
      if (notificationSubscriptionId) {
        await linkReportNotificationToRun(notificationSubscriptionId, userId, currentCase.id, run.runId)
        try {
          const workspace = await harness.get(userId, currentCase.id)
          if (workspace.runs.some(item => item.id === run.runId && item.status === 'succeeded')) {
            await deliverReportNotificationForRun(run.runId)
          }
        } catch {
          // The report run remains valid if optional notification reconciliation is unavailable.
        }
      }
      return res.status(202).json({ success: true, data: { ...run, confirmationRequired: true } })
    }

    try {
      await requirePaidEntitlement(userId, currentCase.id)
    } catch (paymentError) {
      if ((paymentError as Error).message === 'PAYMENT_REQUIRED') {
        const entitlement = (paymentError as Error & { entitlement?: { amountCents: number; currency: string } }).entitlement!
        return res.status(402).json({
          error: 'PAYMENT_REQUIRED',
          message: '请先解锁本案件的完整处理方案',
          caseId: currentCase.id,
          amountCents: entitlement.amountCents,
          currency: entitlement.currency,
        })
      }
      throw paymentError
    }

    const artifacts = await db.getArtifactsByCase(currentCase.id)
    const artifactFacts = artifacts.flatMap((artifact: any) => {
      const metadata = artifact.metadata || {}
      if (!metadata.confirmed || !Array.isArray(metadata.fields)) return []
      return metadata.fields.map((field: any): CollectedFact => ({
        key: field.key,
        label: field.label,
        value: field.value,
        source: `material:${artifact.id}`,
        confidence: field.confidence || 'medium',
        confirmed: true,
        materialId: artifact.id,
      }))
    })

    const storedFacts = await db.getCaseFacts(currentCase.id)
    const facts: CollectedFact[] = [
      ...storedFacts.filter(fact => fact.sourceType !== 'material').map(fact => ({
        key: fact.key,
        label: fact.label,
        value: fact.value,
        source: fact.source,
        confidence: (fact.confidence || 'medium') as CollectedFact['confidence'],
        confirmed: true,
      })),
      ...artifactFacts,
    ]
    const valuesByKey = new Map<string, string>()
    for (const fact of facts) {
      const previous = valuesByKey.get(fact.key)
      if (previous !== undefined && previous !== fact.value) {
        return res.status(409).json({ success: false, error: '已确认的信息存在冲突，请核对事故信息与材料后重新生成', code: 'FACT_CONFLICT' })
      }
      valuesByKey.set(fact.key, fact.value)
    }

    if (facts.length === 0) {
      return res.status(400).json({ success: false, error: '请先确认事故信息或至少一份材料' })
    }

    await ensureCoreTrafficLegalCorpus()
    const legalSearch = buildLegalSearchInput(facts)
    const legalReferences = await db.searchLegalReferences(legalSearch)
    if (legalReferences.length === 0) throw new Error('LEGAL_REFERENCE_REQUIRED')

    const inputRevision = currentCase.inputRevision ?? 0
    const runResult = await db.createAgentRun({
      caseId: currentCase.id,
      task: 'report',
      inputRevision,
      skillVersion: CASE_REPORT_SKILL_VERSION,
    })
    const run = runResult.run
    if (!run) throw new Error('AGENT_RUN_NOT_CREATED')
    if (!runResult.created && (run.status === 'queued' || run.status === 'running')) {
      if (notificationSubscriptionId) {
        await linkReportNotificationToRun(notificationSubscriptionId, userId, currentCase.id, run.id)
        try {
          if ((await db.findAgentRun(run.id))?.status === 'succeeded') await deliverReportNotificationForRun(run.id)
        } catch {
          // The report run remains valid if optional notification reconciliation is unavailable.
        }
      }
      return res.status(202).json({ success: true, data: { runId: run.id, status: run.status } })
    }
    if (!runResult.created && run.status === 'succeeded') {
      const existing = await db.getReportByCase(currentCase.id)
      if (existing?.agentRunId === run.id) {
        if (notificationSubscriptionId) {
          await linkReportNotificationToRun(notificationSubscriptionId, userId, currentCase.id, run.id)
        }
        await deliverReportNotificationForRun(run.id)
        return res.json({ success: true, data: { report: existing!.content } })
      }
    }
    const claimedRun = await db.claimAgentRun(run.id)
    if (!claimedRun) {
      const latestRun = await db.findAgentRun(run.id)
      if (latestRun?.status === 'queued' || latestRun?.status === 'running') {
        if (notificationSubscriptionId) {
          await linkReportNotificationToRun(notificationSubscriptionId, userId, currentCase.id, run.id)
        }
        try {
          if ((await db.findAgentRun(run.id))?.status === 'succeeded') await deliverReportNotificationForRun(run.id)
        } catch {
          // The report run remains valid if optional notification reconciliation is unavailable.
        }
        return res.status(202).json({ success: true, data: { runId: run.id, status: latestRun.status } })
      }
      return res.status(409).json({ success: false, error: '本次分析未完成，请更新信息后重试', data: { runId: run.id, status: latestRun?.status } })
    }
    if (!['queued', 'running', 'failed'].includes(run.status)) {
      return res.status(409).json({ success: false, error: '当前输入版本的报告任务不可重试，请先更新案件信息' })
    }

    try {
      const report = await generateReport({
        facts,
        caseId: currentCase.id,
        accidentDate: legalSearch.accidentDate,
        legalReferences,
      })
      await requirePaidEntitlement(userId, currentCase.id)
      await db.publishRunReport(run.id, report, { userId, materialSnapshot: materialSnapshot(artifacts) })
      if (notificationSubscriptionId) {
        await linkReportNotificationToRun(notificationSubscriptionId, userId, currentCase.id, run.id)
      }
      await deliverReportNotificationForRun(run.id)
      res.json({ success: true, data: { report } })
    } catch (generationError: any) {
      const latestRun = await db.findAgentRun(run.id)
      if (latestRun?.status === 'running') {
        const legalFailure = generationError.message.startsWith('LEGAL_') || generationError.message.startsWith('INVALID_LEGAL_') || generationError.message.startsWith('UNSUPPORTED_')
        const code = generationError.message === 'PAYMENT_REQUIRED'
          ? 'PAYMENT_REQUIRED'
          : generationError.message === 'REPORT_STALE'
            ? 'REPORT_STALE'
            : legalFailure ? 'LEGAL_VALIDATION_FAILED' : 'REPORT_GENERATION_FAILED'
        await db.updateAgentRun(latestRun.id, { status: 'failed', safeErrorCode: code })
      }
      throw generationError
    }
  } catch (err: any) {
    if (err.message === 'PAYMENT_REQUIRED') {
      return res.status(402).json({ error: 'PAYMENT_REQUIRED', message: '案件权益已变更，请查看付费记录' })
    }
    if (process.env.HARNESS_ENABLED === 'true' && ['ACCIDENT_DATE_REQUIRED','JURISDICTION_REQUIRED','FACTS_REQUIRED','FACT_CONFLICT','CALCULATOR_NOT_APPROVED'].includes(err.message)) {
      return res.status(409).json({ success: false, error: '请在案件文书页面补齐并确认信息，计算规则需经审核启用', code: err.message })
    }
    if (err.message === 'REPORT_STALE' || err.message === 'STALE_INPUT_REVISION') return res.status(409).json({ success: false, error: '材料或案件信息已更新，请重新生成报告' })
    if (err.message === 'LEGAL_ACCIDENT_DATE_REQUIRED') return res.status(400).json({ success: false, error: '请先确认格式为 YYYY-MM-DD 的事故日期' })
    if (err.message.startsWith('LEGAL_') || err.message.startsWith('INVALID_LEGAL_') || err.message.startsWith('UNSUPPORTED_')) {
      return res.status(422).json({ success: false, error: '暂未找到足够且可核验的法律依据，请补充信息后重试' })
    }
    console.error('报告生成失败:', safeError(err))
    res.status(500).json({
      success: false,
      error: '报告生成失败，请稍后重试',
    })
  }
})

/**
 * GET /api/reports/:caseId
 * 获取案件的报告
 */
router.get('/:caseId/runs/latest', async (req, res) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ success: false, error: '未认证' })
    const currentCase = await db.findCaseById(userId, req.params.caseId)
    if (!currentCase) return res.status(404).json({ success: false, error: '未找到案件' })
    if (process.env.HARNESS_ENABLED === 'true') {
      const workspace = await harness.get(userId, currentCase.id)
      const run = workspace.runs.filter(r => r.inputRevision === workspace.revision).slice(-1)[0]
      return res.json({ success: true, data: run ? { runId: run.id, status: run.status, safeErrorCode: run.safeErrorCode, confirmationRequired: true } : null })
    }
    const run = await db.findLatestReportRun(currentCase.id, currentCase.inputRevision ?? 0)
    return res.json({ success: true, data: run ? { runId: run.id, status: run.status, inputRevision: run.inputRevision, safeErrorCode: run.safeErrorCode } : null })
  } catch (error) {
    console.error('分析任务恢复失败:', safeError(error))
    return res.status(500).json({ success: false, error: '分析状态暂不可用' })
  }
})

router.get('/:caseId/runs/:runId', async (req, res) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ success: false, error: '未认证' })
    const { caseId, runId } = req.params
    const currentCase = await db.findCaseById(userId, caseId)
    if (!currentCase) return res.status(404).json({ success: false, error: '未找到案件' })
    if (process.env.HARNESS_ENABLED === 'true') {
      const run = (await harness.get(userId, caseId)).runs.find(r => r.id === runId)
      if (!run) return res.status(404).json({ success: false, error: '未找到分析记录' })
      return res.json({ success: true, data: { runId: run.id, status: run.status, safeErrorCode: run.safeErrorCode, confirmationRequired: true } })
    }
    const run = await db.findAgentRun(runId)
    if (!run || run.caseId !== caseId) return res.status(404).json({ success: false, error: '未找到分析记录' })
    const status = run.inputRevision !== (currentCase.inputRevision || 0) ? 'stale' : run.status
    return res.json({ success: true, data: { runId: run.id, status, inputRevision: run.inputRevision, safeErrorCode: run.safeErrorCode } })
  } catch (error) {
    console.error('分析状态查询失败:', safeError(error))
    return res.status(500).json({ success: false, error: '分析状态暂不可用' })
  }
})

router.get('/:caseId', async (req, res) => {
  try {
    const userId = req.userId
    const { caseId } = req.params

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    const caseData = await db.findCaseById(userId, caseId)
    if (!caseData) {
      return res.status(404).json({ success: false, error: '未找到案件' })
    }
    if (process.env.HARNESS_ENABLED === 'true') {
      const workspace = await harness.get(userId, caseId)
      const document = workspace.documents.filter(item => item.type === 'case_report' && item.status === 'approved')
        .sort((a,b) => b.version - a.version)[0]
      if (!document) return res.status(409).json({ success: false, error: '请在案件文书中确认草稿并完成必要审核' })
      const approved = await harness.approved(userId, caseId, document.id)
      return res.json({ success: true, data: { report: {
        caseId, analysis: approved.sections[0].paragraphs.join('\n'), liability: '本系统不自动认定事故责任。',
        compensation: approved.sections.slice(1).flatMap(section => section.paragraphs).join('\n'),
        recommendations: ['请查看案件文书中的行动计划'], generatedAt: approved.createdAt,
      } } })
    }

    if (!caseData.hasReport) return res.status(409).json({ success: false, error: '材料已更新，请重新生成报告' })
    const report = await db.getReportByCase(caseId)
    if (!report) {
      return res.status(404).json({ success: false, error: '报告尚未生成' })
    }

    try {
      await requirePaidEntitlement(userId, caseId)
    } catch (paymentError) {
      if ((paymentError as Error).message === 'PAYMENT_REQUIRED') {
        const entitlement = (paymentError as Error & { entitlement?: { amountCents: number; currency: string } }).entitlement!
        return res.status(402).json({
          error: 'PAYMENT_REQUIRED',
          message: '请先解锁本案件的完整处理方案',
          caseId,
          amountCents: entitlement.amountCents,
          currency: entitlement.currency,
        })
      }
      throw paymentError
    }

    const artifacts = await db.getArtifactsByCase(caseId)
    const snapshot = report.inputSnapshot?.materialSnapshot
    if ((report.inputRevision !== undefined && report.inputRevision !== caseData.inputRevision)
      || (snapshot && snapshot !== materialSnapshot(artifacts))) {
      return res.status(409).json({ success: false, error: '案件信息已更新，请重新生成报告' })
    }
    res.json({ success: true, data: { report: report.content } })
  } catch (err: any) {
    console.error('报告查询失败:', safeError(err))
    res.status(500).json({
      success: false,
      error: '报告查询失败',
    })
  }
})

/**
 * POST /api/reports/:caseId/export
 * 导出报告为 PDF/Word
 */
router.post('/:caseId/export', async (req, res) => {
  const userId = req.userId
  const { caseId } = req.params
  const { format } = req.body

  if (!userId) {
    return res.status(401).json({ success: false, error: '未认证' })
  }

  if (!['pdf', 'docx'].includes(format)) {
    return res.status(400).json({ success: false, error: '不支持的导出格式' })
  }

  try {
    const caseData = await db.findCaseById(userId, caseId)
    if (!caseData) {
      return res.status(404).json({ success: false, error: '未找到案件' })
    }
    await requirePaidEntitlement(userId, caseId)
    return res.status(501).json({ success: false, error: '报告导出功能尚未实现' })
  } catch (paymentError) {
    if ((paymentError as Error).message === 'PAYMENT_REQUIRED') {
      const entitlement = (paymentError as Error & { entitlement?: { amountCents: number; currency: string } }).entitlement!
      return res.status(402).json({ error: 'PAYMENT_REQUIRED', message: '请先解锁本案件的完整处理方案', caseId, amountCents: entitlement.amountCents, currency: entitlement.currency })
    }
    console.error('报告导出查询失败:', safeError(paymentError))
    return res.status(500).json({ success: false, error: '报告导出暂不可用' })
  }
})

export default router
