import express from 'express'
import { memoryDB } from '../db/memory'
import { generateReport, formatReportAsText } from '../services/report'

const router = express.Router()

// 生成报告
router.post('/generate', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    // 获取当前案件
    const currentCase = await memoryDB.findActiveCase(userId)

    if (!currentCase) {
      return res.status(404).json({ success: false, error: '未找到活跃案件' })
    }

    // TODO: 从数据库获取收集的 facts
    // 临时使用模拟数据
    const facts = [
      {
        key: 'accidentTime',
        label: '事故时间',
        value: '2026年9月12日15:30',
        source: '交警认定书',
        confidence: 'high' as const,
        confirmed: true,
      },
      {
        key: 'location',
        label: '事故地点',
        value: '杭州市西湖区文一路',
        source: '交警认定书',
        confidence: 'high' as const,
        confirmed: true,
      },
      {
        key: 'liability',
        label: '责任划分',
        value: '对方全责',
        source: '交警认定书',
        confidence: 'high' as const,
        confirmed: true,
      },
    ]

    // 生成报告
    const report = await generateReport(facts)
    report.caseId = currentCase.id

    // 更新案件状态
    await memoryDB.updateCase(userId, {
      hasReport: true,
      status: 'ready',
      statusLabel: '报告已生成',
    })

    res.json({
      success: true,
      data: report,
    })
  } catch (err: any) {
    console.error('生成报告错误:', err)
    res.status(500).json({ success: false, error: err.message || '生成报告失败' })
  }
})

// 获取报告（文本格式）
router.get('/current/text', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    // TODO: 从数据库获取已生成的报告
    // 临时返回示例
    res.json({
      success: true,
      data: {
        text: '报告生成功能开发中...',
      },
    })
  } catch (err) {
    console.error('获取报告错误:', err)
    res.status(500).json({ success: false, error: '获取报告失败' })
  }
})

export default router
