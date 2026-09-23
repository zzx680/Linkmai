import { randomBytes } from 'crypto'
import { config } from '../config'
import { db } from '../db'
import { paymentProvider } from './payment/provider'

const entitlementFeatures = (paid: boolean) => ({
  fullReport: paid,
  compensationEstimate: paid,
  actionPlan: paid,
  documentGeneration: paid,
  rerunAfterMaterialUpdate: paid,
})

export async function getEntitlement(userId: string, caseId: string) {
  const caseData = await db.findCaseById(userId, caseId)
  if (!caseData) throw new Error('CASE_NOT_FOUND')
  const entitlement = await db.getCaseEntitlement(userId, caseId)
  const status = entitlement?.status || 'unpaid'
  return {
    caseId,
    status,
    amountCents: entitlement?.amountCents || config.payment.amountCents,
    currency: entitlement?.currency || config.payment.currency,
    paidAt: entitlement?.paidAt || null,
    features: entitlementFeatures(status === 'paid'),
  }
}

export async function requirePaidEntitlement(userId: string, caseId: string) {
  const entitlement = await getEntitlement(userId, caseId)
  if (entitlement.status !== 'paid') {
    const error = new Error('PAYMENT_REQUIRED') as Error & { entitlement?: typeof entitlement }
    error.entitlement = entitlement
    throw error
  }
  return entitlement
}

export async function createCasePaymentOrder(userId: string, caseId: string, openid: string, idempotencyKey?: string) {
  const caseData = await db.findCaseById(userId, caseId)
  if (!caseData) throw new Error('CASE_NOT_FOUND')
  const entitlement = await db.getCaseEntitlement(userId, caseId)
  if (entitlement?.status === 'paid') {
    return { alreadyPaid: true as const, entitlement: { caseId, status: 'paid' as const, paidAt: entitlement.paidAt || null } }
  }
  if (idempotencyKey) {
    const idempotent = await db.findPaymentOrderByIdempotency(userId, caseId, idempotencyKey)
    if (idempotent?.status === 'paid') {
      return { alreadyPaid: true as const, entitlement: { caseId, status: 'paid' as const, paidAt: idempotent.paidAt || null } }
    }
    if (idempotent && (!['created', 'pending'].includes(idempotent.status) || idempotent.expiresAt.getTime() <= Date.now())) {
      throw new Error(idempotent.expiresAt.getTime() <= Date.now() ? 'ORDER_EXPIRED' : 'ORDER_NOT_PAYABLE')
    }
    if (idempotent) {
      const payment = idempotent.prepayId ? paymentProvider.createPaymentParams(idempotent.prepayId) : undefined
      return orderResponse(idempotent, payment)
    }
  }
  const activeOrder = await db.findActivePaymentOrder(userId, caseId)
  if (activeOrder?.prepayId) {
    return orderResponse(activeOrder, paymentProvider.createPaymentParams(activeOrder.prepayId))
  }
  if (config.payment.provider !== 'wechat' && config.nodeEnv === 'production') {
    throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED')
  }
  const now = new Date()
  const provisional = await db.createPaymentOrder({
    caseId,
    userId,
    amountCents: config.payment.amountCents,
    currency: config.payment.currency,
    idempotencyKey: idempotencyKey || `server_${randomBytes(16).toString('hex')}`,
  })
  if (!provisional) throw new Error('ORDER_CREATE_FAILED')
  if (provisional.status === 'paid') throw new Error('ALREADY_PAID')
  if (provisional.prepayId) return orderResponse(provisional, paymentProvider.createPaymentParams(provisional.prepayId))
  const providerOrder = await paymentProvider.createOrder({
    orderNo: provisional.orderNo,
    description: '灵迈案件完整处理方案',
    amountCents: provisional.amountCents,
    currency: provisional.currency,
    expiresAt: provisional.expiresAt || new Date(now.getTime() + config.payment.orderExpiresMinutes * 60_000),
    openid,
    userId,
  })
  const order = await db.setPaymentOrderPrepay(provisional.id, providerOrder.prepayId)
  return orderResponse(order, providerOrder.payment)
}

async function createLaunchParams(prepayId: string) {
  return paymentProvider.createPaymentParams(prepayId)
}

function orderResponse(order: any, payment?: any) {
  return {
    alreadyPaid: false as const,
    orderId: order.id,
    orderNo: order.orderNo,
    ...(payment ? { payment } : {}),
    expiresAt: order.expiresAt,
  }
}

export async function queryPaymentOrder(userId: string, orderId: string) {
  const order = await db.findPaymentOrderById(userId, orderId)
  if (!order) throw new Error('ORDER_NOT_FOUND')
  const entitlement = await db.getCaseEntitlement(userId, order.caseId)
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    caseId: order.caseId,
    status: order.status,
    amountCents: order.amountCents,
    currency: order.currency,
    paidAt: order.paidAt || null,
    entitlement: { status: entitlement?.status || 'unpaid', paidAt: entitlement?.paidAt || null },
  }
}

export async function processPaymentNotification(headers: Record<string, string | string[] | undefined>, rawBody: Buffer) {
  if (config.payment.provider !== 'wechat') throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED')
  const notification = paymentProvider.verifyNotification(headers, rawBody)
  if (notification.appId !== config.payment.wechat.appId || notification.mchId !== config.payment.wechat.mchId) {
    throw new Error('WECHAT_MERCHANT_MISMATCH')
  }
  const order = await db.findPaymentOrderByOrderNo(notification.orderNo)
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (notification.userId !== order.userId) throw new Error('ORDER_USER_MISMATCH')
  if (notification.amountCents !== order.amountCents || notification.currency !== order.currency) throw new Error('PAYMENT_AMOUNT_MISMATCH')
  if (notification.tradeState !== 'SUCCESS') return { success: true, paid: false }
  const updated = await db.completePaymentOrder({
    orderNo: notification.orderNo,
    userId: order.userId,
    amountCents: notification.amountCents,
    currency: notification.currency,
    wechatTransactionId: notification.transactionId,
  })
  return { success: true, paid: updated.status === 'paid' }
}

export function paymentRequiredPayload(caseId: string, entitlement: { amountCents: number; currency: string }) {
  return {
    error: 'PAYMENT_REQUIRED',
    message: '请先解锁本案件的完整处理方案',
    caseId,
    amountCents: entitlement.amountCents,
    currency: entitlement.currency,
  }
}
