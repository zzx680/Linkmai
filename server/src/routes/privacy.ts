import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db'
import { PrivacyRequest } from '../db/privacy'
import { safeError } from '../utils/safe-error'

const router = Router()
const schema = z.object({ kind: z.enum(['export_data', 'delete_data', 'close_account']) }).strict()

function dto(item: PrivacyRequest) {
  const { userId: _userId, ...result } = item
  return result
}

router.get('/requests', async (req, res) => {
  if (!req.userId) return res.status(401).json({ success: false, error: '未认证' })
  try {
    const items = await db.getPrivacyRequestsByUser(req.userId)
    res.json({ success: true, data: items.map(dto) })
  } catch (error) {
    console.error('查询数据申请失败:', safeError(error))
    res.status(500).json({ success: false, error: '暂时无法查询申请，请稍后重试' })
  }
})

router.post('/requests', async (req, res) => {
  if (!req.userId) return res.status(401).json({ success: false, error: '未认证' })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: '请选择有效的申请类型' })
  try {
    if (!await db.findUserById(req.userId)) return res.status(401).json({ success: false, error: '账户不存在，请重新登录' })
    const item = await db.createPrivacyRequest(req.userId, parsed.data.kind)
    res.json({ success: true, data: dto(item) })
  } catch (error) {
    console.error('提交数据申请失败:', safeError(error))
    res.status(500).json({ success: false, error: '申请提交失败，请稍后重试' })
  }
})

export default router
