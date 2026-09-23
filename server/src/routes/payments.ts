import express from 'express'
import { db } from '../db'
import { createCasePaymentOrder, getEntitlement, processPaymentNotification, queryPaymentOrder } from '../services/payment'

const casePaymentRouter = express.Router()
const paymentOrderRouter = express.Router()

function respondWithError(res: express.Response, err: unknown) {
  const code = (err as Error).message
  const known: Record<string, { status: number; message: string }> = {
    CASE_NOT_FOUND: { status: 404, message: '未找到案件' },
    ORDER_NOT_FOUND: { status: 404, message: '未找到支付订单' },
    PAYMENT_PROVIDER_NOT_CONFIGURED: { status: 503, message: '支付服务暂不可用' },
    ORDER_EXPIRED: { status: 410, message: '支付订单已过期，请重新创建' },
    ALREADY_PAID: { status: 409, message: '本案件已解锁' },
    ORDER_NOT_PAYABLE: { status: 409, message: '支付订单当前不可支付' },
    PAYMENT_AMOUNT_MISMATCH: { status: 400, message: '支付金额校验失败' },
    TRANSACTION_MISMATCH: { status: 409, message: '支付交易信息不一致' },
    TRANSACTION_ALREADY_USED: { status: 409, message: '该支付交易已关联其他订单' },
    ORDER_USER_MISMATCH: { status: 400, message: '支付用户校验失败' },
  }
  const mapped = known[code]
  return res.status(mapped?.status || 500).json({ error: mapped ? code : 'PAYMENT_ERROR', message: mapped?.message || '支付操作失败' })
}

casePaymentRouter.get('/current/entitlement', async (req, res) => {
  try {
    const userId = req.userId!
    const currentCase = await db.findActiveCase(userId)
    if (!currentCase) return res.status(404).json({ error: 'CASE_NOT_FOUND', message: '当前没有活跃案件' })
    res.json(await getEntitlement(userId, currentCase.id))
  } catch (err) {
    respondWithError(res, err)
  }
})

casePaymentRouter.post('/:caseId/payment-orders', async (req, res) => {
  try {
    const user = req.user
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED', message: '请先登录' })
    const result = await createCasePaymentOrder(user.id, req.params.caseId, user.openid, req.get('Idempotency-Key') || undefined)
    res.status(result.alreadyPaid ? 200 : 201).json(result)
  } catch (err) {
    respondWithError(res, err)
  }
})

paymentOrderRouter.get('/:orderId', async (req, res) => {
  try {
    const result = await queryPaymentOrder(req.userId!, req.params.orderId)
    res.json(result)
  } catch (err) {
    respondWithError(res, err)
  }
})

export async function paymentNotificationHandler(req: express.Request, res: express.Response) {
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ code: 'FAIL', message: 'invalid body' })
    await processPaymentNotification(req.headers as Record<string, string | string[] | undefined>, req.body)
    res.json({ code: 'SUCCESS', message: '成功' })
  } catch (err) {
    console.error('WeChat payment notification rejected:', (err as Error).message)
    res.status(400).json({ code: 'FAIL', message: '通知校验失败' })
  }
}

export { casePaymentRouter, paymentOrderRouter }
export default paymentOrderRouter
