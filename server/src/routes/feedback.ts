import { Router } from 'express'
import { db } from '../db'
import { safeError } from '../utils/safe-error'

const feedbackRouter = Router()

feedbackRouter.post('/', async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ success: false, error: '未认证' })
    const { content } = req.body || {}
    if (typeof content !== 'string' || !content.trim() || content.trim().length > 500) {
      return res.status(400).json({ success: false, error: '请填写不超过 500 字的反馈内容' })
    }

    const feedback = await db.createFeedback(req.userId, content.trim())
    res.status(201).json({ success: true, data: { id: feedback.id, createdAt: feedback.createdAt } })
  } catch (error) {
    console.error('提交反馈失败:', safeError(error))
    res.status(500).json({ success: false, error: '提交反馈失败，请稍后重试' })
  }
})

export default feedbackRouter
