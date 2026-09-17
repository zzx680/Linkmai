import express from 'express'
import { memoryDB } from '../db/memory'

const router = express.Router()

// 获取当前案件
router.get('/current', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    const currentCase = await memoryDB.findActiveCase(userId)

    res.json({ success: true, data: currentCase })
  } catch (err) {
    console.error('获取案件错误:', err)
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

    const newCase = await memoryDB.createCase(userId, '新的事故分析')

    res.json({ success: true, data: newCase })
  } catch (err) {
    console.error('创建案件错误:', err)
    res.status(500).json({ success: false, error: '创建案件失败' })
  }
})

// 更新案件状态
router.patch('/current', async (req, res) => {
  try {
    const userId = req.userId
    const { status, statusLabel, materialCount, liability, compensation, hasReport } = req.body

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    const updates: any = {}
    if (status !== undefined) updates.status = status
    if (statusLabel !== undefined) updates.statusLabel = statusLabel
    if (materialCount !== undefined) updates.materialCount = materialCount
    if (liability !== undefined) updates.liability = liability
    if (compensation !== undefined) updates.compensation = compensation
    if (hasReport !== undefined) updates.hasReport = hasReport

    const updatedCase = await memoryDB.updateCase(userId, updates)

    if (!updatedCase) {
      return res.status(404).json({ success: false, error: '未找到活跃案件' })
    }

    res.json({ success: true, data: updatedCase })
  } catch (err) {
    console.error('更新案件错误:', err)
    res.status(500).json({ success: false, error: '更新案件失败' })
  }
})

// 删除当前案件
router.delete('/current', async (req, res) => {
  try {
    const userId = req.userId

    if (!userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    await memoryDB.deleteActiveCase(userId)

    res.json({ success: true })
  } catch (err) {
    console.error('删除案件错误:', err)
    res.status(500).json({ success: false, error: '删除案件失败' })
  }
})

export default router
