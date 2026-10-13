import { Router } from 'express'
import { db } from '../db'
import { generateReport } from '../services/report'
import { CollectedFact } from '../services/agent'
import { materialSnapshot } from '../services/material-snapshot'
import { requirePaidEntitlement } from '../services/payment'

const router = Router()

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
    if (typeof caseId !== 'string' || !caseId) return res.status(400).json({ success: false, error: '缺少案件编号' })
    const currentCase = await db.findCaseById(userId, caseId)
    if (!currentCase) {
      return res.status(404).json({ success: false, error: '未找到活跃案件' })
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
    const facts = artifacts.flatMap((artifact: any) => {
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

    if (facts.length === 0) {
      return res.status(400).json({ success: false, error: '请先确认至少一份材料' })
    }

    const snapshot = materialSnapshot(artifacts)
    const report = await generateReport(facts, currentCase.id)
    await db.publishReport(userId, currentCase.id, report, snapshot)

    res.json({ success: true, data: { report } })
  } catch (err: any) {
    if (err.message === 'REPORT_STALE') return res.status(409).json({ success: false, error: '材料已更新，请重新生成报告' })
    console.error('报告生成失败:', err)
    res.status(500).json({
      success: false,
      error: err.message || '报告生成失败',
    })
  }
})

/**
 * GET /api/reports/:caseId
 * 获取案件的报告
 */
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

    res.json({ success: true, data: { report: report.content } })
  } catch (err: any) {
    console.error('报告查询失败:', err)
    res.status(500).json({
      success: false,
      error: err.message || '报告查询失败',
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

  const caseData = await db.findCaseById(userId, caseId)
  if (!caseData) {
    return res.status(404).json({ success: false, error: '未找到案件' })
  }

  try {
    await requirePaidEntitlement(userId, caseId)
  } catch (paymentError) {
    if ((paymentError as Error).message === 'PAYMENT_REQUIRED') {
      const entitlement = (paymentError as Error & { entitlement?: { amountCents: number; currency: string } }).entitlement!
      return res.status(402).json({ error: 'PAYMENT_REQUIRED', message: '请先解锁本案件的完整处理方案', caseId, amountCents: entitlement.amountCents, currency: entitlement.currency })
    }
    throw paymentError
  }

  return res.status(501).json({
    success: false,
    error: '报告导出功能尚未实现',
  })
})

export default router
