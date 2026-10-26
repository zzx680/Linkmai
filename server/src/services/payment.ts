import { config } from '../config'
import { db, PaymentOrder } from '../db'
import { paymentProvider, ProviderOrder } from './payment/provider'

const entitlementFeatures = (paid: boolean) => ({
  fullReport: paid,
  compensationEstimate: paid,
  actionPlan: paid,
  // Keep the response field compatible, but do not grant an unimplemented feature.
  documentGeneration: false,
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

function validateProviderOrder(order: PaymentOrder, providerOrder: ProviderOrder) {
  if (providerOrder.orderNo !== order.orderNo) throw new Error('ORDER_MISMATCH')
  if (providerOrder.appId !== config.payment.wechat.appId) throw new Error('PAYMENT_APPID_MISMATCH')
  if (providerOrder.mchId !== config.payment.wechat.mchId) throw new Error('PAYMENT_MCHID_MISMATCH')
  if (providerOrder.userId && providerOrder.userId !== order.userId) throw new Error('ORDER_USER_MISMATCH')
  if (providerOrder.amountCents !== order.amountCents || providerOrder.currency !== order.currency) {
    throw new Error('PAYMENT_AMOUNT_MISMATCH')
  }
}

async function completeOrder(order: PaymentOrder, providerOrder: ProviderOrder) {
  validateProviderOrder(order, providerOrder)
  if (!providerOrder.transactionId) throw new Error('PAYMENT_TRANSACTION_MISSING')
  return db.completePaymentOrder({
    orderNo: order.orderNo,
    userId: order.userId,
    amountCents: order.amountCents,
    currency: order.currency,
    wechatTransactionId: providerOrder.transactionId,
  })
}

async function closeExpiredOrder(order: PaymentOrder) {
  try {
    await paymentProvider.closeOrder(order.orderNo)
  } catch (error) {
    if ((error as Error).message !== 'ORDER_NOT_PAYABLE') throw error
  }
  return db.updatePaymentOrderStatus(order.id, 'closed')
}

async function recoverCreateOrderFailure(order: PaymentOrder, originalError: unknown): Promise<never> {
  try {
    const providerOrder = await paymentProvider.queryOrder(order.orderNo)
    validateProviderOrder(order, providerOrder)
    if (providerOrder.tradeState === 'SUCCESS') {
      await completeOrder(order, providerOrder)
      throw new Error('ALREADY_PAID')
    }
    if (providerOrder.tradeState === 'NOTPAY') {
      // A failed create request may race with another request that is still
      // using this order. Only close after the server-side expiry has passed.
      if (order.expiresAt.getTime() > Date.now()) throw new Error('PAYMENT_CONFIRMATION_PENDING')
      await closeExpiredOrder(order)
      throw originalError
    }
    if (['CLOSED', 'REVOKED'].includes(providerOrder.tradeState)) {
      await db.updatePaymentOrderStatus(order.id, 'closed')
      throw originalError
    }
    if (providerOrder.tradeState === 'PAYERROR') {
      await db.updatePaymentOrderStatus(order.id, 'failed')
      throw originalError
    }
    throw new Error('PAYMENT_CONFIRMATION_PENDING')
  } catch (recoveryError) {
    const code = (recoveryError as Error).message
    if (code === 'PAYMENT_ORDER_NOT_FOUND') {
      if (order.expiresAt.getTime() > Date.now()) throw new Error('PAYMENT_CONFIRMATION_PENDING')
      await db.updatePaymentOrderStatus(order.id, 'failed')
      throw originalError
    }
    if (code === 'PAYMENT_PROVIDER_ERROR') throw new Error('PAYMENT_CONFIRMATION_PENDING')
    throw recoveryError
  }
}

async function reconcilePaymentOrder(order: PaymentOrder): Promise<PaymentOrder> {
  if (order.status === 'refunded') return order

  let providerOrder: ProviderOrder
  try {
    providerOrder = await paymentProvider.queryOrder(order.orderNo)
  } catch (error) {
    if ((error as Error).message === 'PAYMENT_ORDER_NOT_FOUND' && order.status === 'created') {
      return (await db.updatePaymentOrderStatus(order.id, 'failed')) || order
    }
    if (order.status === 'paid') return order
    if ((error as Error).message === 'PAYMENT_PROVIDER_ERROR') throw new Error('PAYMENT_CONFIRMATION_PENDING')
    throw error
  }

  validateProviderOrder(order, providerOrder)
  switch (providerOrder.tradeState) {
    case 'SUCCESS':
      return completeOrder(order, providerOrder)
    case 'CLOSED':
    case 'REVOKED':
      return (await db.updatePaymentOrderStatus(order.id, 'closed')) || order
    case 'PAYERROR':
      return (await db.updatePaymentOrderStatus(order.id, 'failed')) || order
    case 'REFUND':
      // REFUND also covers partial/in-progress refunds. Only a verified,
      // successful full-refund notification may revoke this case's access.
      return order
    case 'NOTPAY':
      if (order.expiresAt.getTime() <= Date.now()) {
        return (await closeExpiredOrder(order)) || order
      }
      return order
    case 'USERPAYING':
      return order
    default:
      throw new Error('PAYMENT_TRADE_STATE_UNKNOWN')
  }
}

function paymentOrderResponse(order: PaymentOrder, entitlement: Awaited<ReturnType<typeof getEntitlement>>) {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    caseId: order.caseId,
    status: order.status,
    amountCents: order.amountCents,
    currency: order.currency,
    paidAt: order.paidAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    expiresAt: order.expiresAt,
    entitlement,
  }
}

export async function createCasePaymentOrder(userId: string, caseId: string, openid: string, idempotencyKey?: string) {
  if (config.payment.provider === 'disabled') throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED')
  const caseData = await db.findCaseById(userId, caseId)
  if (!caseData) throw new Error('CASE_NOT_FOUND')
  const entitlement = await db.getCaseEntitlement(userId, caseId)
  if (entitlement?.status === 'paid') {
    return { alreadyPaid: true as const, entitlement: await getEntitlement(userId, caseId) }
  }

  let existing = idempotencyKey
    ? await db.findPaymentOrderByIdempotency(userId, caseId, idempotencyKey)
    : null
  if (!existing) existing = await db.findPendingPaymentOrder(userId, caseId)

  if (existing) {
    const reconciled = await reconcilePaymentOrder(existing)
    if (reconciled.status === 'paid') {
      return { alreadyPaid: true as const, entitlement: await getEntitlement(userId, caseId) }
    }
    if (['created', 'pending'].includes(reconciled.status)) {
      if (reconciled.expiresAt.getTime() <= Date.now()) throw new Error('PAYMENT_CONFIRMATION_PENDING')
      if (!reconciled.prepayId) throw new Error('PAYMENT_CONFIRMATION_PENDING')
      // The active provider order has an immutable amount; keep the case entitlement
      // aligned so a refreshed client does not repeatedly reject the same order.
      await db.syncPendingEntitlementAmount(userId, caseId, reconciled.amountCents, reconciled.currency)
      return {
        alreadyPaid: false as const,
        orderId: reconciled.id,
        orderNo: reconciled.orderNo,
        amountCents: reconciled.amountCents,
        currency: reconciled.currency,
        payment: paymentProvider.createPaymentParams(reconciled.prepayId),
        expiresAt: reconciled.expiresAt,
      }
    }
    if (idempotencyKey && existing.idempotencyKey === idempotencyKey) throw new Error('ORDER_NOT_PAYABLE')
  }

  const order = await db.createPaymentOrder({
    caseId,
    userId,
    amountCents: config.payment.amountCents,
    currency: config.payment.currency,
    idempotencyKey,
  })
  if (!order) throw new Error('ORDER_CREATION_FAILED')
  if (order.status === 'paid') {
    return { alreadyPaid: true as const, entitlement: await getEntitlement(userId, caseId) }
  }
  if (!['created', 'pending'].includes(order.status)) throw new Error('ORDER_NOT_PAYABLE')
  if (order.expiresAt.getTime() <= Date.now()) throw new Error('PAYMENT_CONFIRMATION_PENDING')
  if (order.prepayId) {
    return {
      alreadyPaid: false as const,
      orderId: order.id,
      orderNo: order.orderNo,
      amountCents: order.amountCents,
      currency: order.currency,
      payment: paymentProvider.createPaymentParams(order.prepayId),
      expiresAt: order.expiresAt,
    }
  }

  try {
    const providerOrder = await paymentProvider.createOrder({
      orderNo: order.orderNo,
      description: `灵迈案件完整处理方案-${caseId.slice(-8)}`,
      amountCents: order.amountCents,
      currency: order.currency,
      expiresAt: order.expiresAt,
      openid,
      userId,
    })
    const pendingOrder = await db.setPaymentOrderPrepay(order.id, providerOrder.prepayId)
    return {
      alreadyPaid: false as const,
      orderId: pendingOrder.id,
      orderNo: pendingOrder.orderNo,
      amountCents: pendingOrder.amountCents,
      currency: pendingOrder.currency,
      payment: providerOrder.payment,
      expiresAt: pendingOrder.expiresAt,
    }
  } catch (error) {
    return recoverCreateOrderFailure(order, error)
  }
}

export async function queryPaymentOrder(userId: string, orderId: string) {
  const order = await db.findPaymentOrderById(userId, orderId)
  if (!order) throw new Error('ORDER_NOT_FOUND')
  const reconciled = await reconcilePaymentOrder(order)
  return paymentOrderResponse(reconciled, await getEntitlement(userId, reconciled.caseId))
}

export async function processPaymentNotification(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
) {
  const notification = paymentProvider.verifyNotification(headers, rawBody)
  const order = await db.findPaymentOrderByOrderNo(notification.orderNo)
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (notification.eventType === 'REFUND.SUCCESS' || notification.tradeState === 'REFUND') {
    if (notification.mchId !== config.payment.wechat.mchId) throw new Error('PAYMENT_MCHID_MISMATCH')
    if (notification.amountCents !== order.amountCents || notification.currency !== order.currency
      || !Number.isSafeInteger(notification.refundAmountCents) || notification.refundAmountCents! <= 0
      || notification.refundAmountCents! > order.amountCents) throw new Error('PAYMENT_AMOUNT_MISMATCH')
    if (notification.tradeStateDescription !== 'SUCCESS') throw new Error('PAYMENT_REFUND_NOT_SUCCESSFUL')
    if (!notification.transactionId || (order.wechatTransactionId && notification.transactionId !== order.wechatTransactionId)) {
      throw new Error('TRANSACTION_MISMATCH')
    }
    // Partial goodwill refunds keep access. The current product supports
    // revoking access for a single successful full-order refund only.
    if (notification.refundAmountCents !== order.amountCents) return { success: true, paid: order.status === 'paid' }
    if (order.status === 'refunded') return { success: true, paid: false }
    if (order.status !== 'paid') throw new Error('ORDER_NOT_PAYABLE')
    await db.refundPaymentOrder(order.id)
    return { success: true, paid: false }
  }
  validateProviderOrder(order, notification)

  if (notification.tradeState === 'SUCCESS') {
    const updated = await completeOrder(order, notification)
    return { success: true, paid: updated.status === 'paid' }
  }
  if (['CLOSED', 'REVOKED'].includes(notification.tradeState)) {
    await db.updatePaymentOrderStatus(order.id, 'closed')
  } else if (notification.tradeState === 'PAYERROR') {
    await db.updatePaymentOrderStatus(order.id, 'failed')
  }
  return { success: true, paid: false }
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
