import { Request, Response, NextFunction } from 'express'
import { requirePaidEntitlement, paymentRequiredPayload } from '../services/payment'

export function requireCaseEntitlement(getCaseId: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    const caseId = getCaseId(req)
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED', message: '请先登录' })
    if (!caseId) return res.status(400).json({ error: 'CASE_ID_REQUIRED', message: '缺少案件编号' })
    try {
      await requirePaidEntitlement(userId, caseId)
      next()
    } catch (err) {
      if ((err as Error).message === 'PAYMENT_REQUIRED') {
        const entitlement = (err as Error & { entitlement?: { amountCents: number; currency: string } }).entitlement!
        return res.status(402).json(paymentRequiredPayload(caseId, entitlement))
      }
      if ((err as Error).message === 'CASE_NOT_FOUND') {
        return res.status(404).json({ error: 'CASE_NOT_FOUND', message: '未找到案件' })
      }
      next(err)
    }
  }
}
