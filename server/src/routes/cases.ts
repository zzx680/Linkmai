import { safeError } from '../utils/safe-error'
import express from 'express'
import { db } from '../db'
import { config } from '../config'

const router = express.Router()

async function withEntitlement(caseData: any, userId: string) {
  if (!caseData) return null
  const entitlement = await db.getCaseEntitlement(userId, caseData.id)
  const paid = entitlement?.status === 'paid'
  return {
    ...caseData,
    materialCount: caseData.materialCount ?? caseData.material_count ?? 0,
    hasReport: caseData.hasReport ?? caseData.has_report ?? false,
    entitlement: {
      status: entitlement?.status || 'unpaid',
      amountCents: entitlement?.amountCents || config.payment.amountCents,
      currency: entitlement?.currency || config.payment.currency,
      paidAt: entitlement?.paidAt || null,
    },
    nextAction: !caseData.materialCount
      ? 'continue_materials'
      : paid
        ? ((caseData.hasReport ?? caseData.has_report) ? 'view_report' : 'continue_case')
        : 'unlock_full_plan',
  }
}

// 获取当前案件
router.get('/current', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    const currentCase = await db.findActiveCase(userId)

    res.json({ success: true, data: currentCase ? await withEntitlement(currentCase, userId) : null })
  } catch (err) {
    console.error('获取案件错误:', safeError(err))
    res.status(500).json({ success: false, error: '获取案件失败' })
  }
})

// 创建案件
router.post('/current', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    const newCase = await db.createCase(userId, '新的事故分析')

    res.json({ success: true, data: await withEntitlement(newCase, userId) })
  } catch (err) {
    console.error('创建案件错误:', safeError(err))
    res.status(500).json({ success: false, error: '创建案件失败' })
  }
})

// 更新案件状态
router.patch('/current', async (req, res) => {
  try {
    const userId = req.userId
    const body = req.body || {}

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    // Status, counters and report conclusions are derived by server workflows.
    if (Object.keys(body).some(key => key !== 'title') || typeof body.title !== 'string'
      || !body.title.trim() || body.title.length > 100) {
      return res.status(400).json({ success: false, error: '仅支持修改案件名称（1–100 字）' })
    }
    const updates = { title: body.title.trim() }

    const updatedCase = await db.updateCase(userId, updates)

    if (!updatedCase) {
      return res.status(404).json({ success: false, error: '未找到活跃案件' })
    }

    res.json({ success: true, data: await withEntitlement(updatedCase, userId) })
  } catch (err) {
    console.error('更新案件错误:', safeError(err))
    res.status(500).json({ success: false, error: '更新案件失败' })
  }
})

// 归档当前案件，保留订单、回调关联及案件材料。
router.delete('/current', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    await db.deleteActiveCase(userId)

    res.json({ success: true })
  } catch (err) {
    console.error('删除案件错误:', safeError(err))
    res.status(500).json({ success: false, error: '删除案件失败' })
  }
})

export default router
