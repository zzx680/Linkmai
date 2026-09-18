import { Router } from 'express'
import { generateReport } from '../services/report'
import { CollectedFact } from '../services/agent'

const router = Router()

/**
 * POST /api/reports/generate
 * 生成事故分析报告
 */
router.post('/generate', async (req, res) => {
  try {
    const { facts } = req.body

    if (!Array.isArray(facts) || facts.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少事实信息',
      })
    }

    const report = await generateReport(facts as CollectedFact[])

    res.json({
      success: true,
      data: report,
    })
  } catch (err: any) {
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
    const { caseId } = req.params

    // TODO: 从数据库读取已生成的报告
    res.json({
      success: true,
      data: {
        caseId,
        message: '报告查询功能待实现',
      },
    })
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
  try {
    const { caseId } = req.params
    const { format } = req.body

    // TODO: 实现报告导出功能
    res.json({
      success: true,
      data: {
        caseId,
        format,
        message: '报告导出功能待实现',
      },
    })
  } catch (err: any) {
    console.error('报告导出失败:', err)
    res.status(500).json({
      success: false,
      error: err.message || '报告导出失败',
    })
  }
})

export default router
