import type { CaseEntitlement, PaymentOrder, PaymentOrderResponse } from '../services/api'

export type PaymentConfirmation = 'paid' | 'pending' | 'failed' | 'refunded'
export type PendingPayment = { userId: string; caseId: string; orderId: string }
export const PENDING_PAYMENT_KEY = 'linkmai.pending-payment'
export const PAYMENT_POLL_DELAYS = [0, 800, 1200, 1800, 2500, 3500]

export function paymentConfirmation(order: PaymentOrder): PaymentConfirmation {
  if (order.status === 'refunded') return 'refunded'
  if (order.status === 'paid') return 'paid'
  if (order.status === 'failed' || order.status === 'closed') return 'failed'
  return 'pending'
}

export function matchesPendingPayment(value: unknown, userId: string, caseId: string): value is PendingPayment {
  if (!value || typeof value !== 'object') return false
  const payment = value as Partial<PendingPayment>
  return payment.userId === userId && payment.caseId === caseId
    && typeof payment.orderId === 'string' && payment.orderId.length > 0
}

export function formatPaymentPrice(entitlement?: CaseEntitlement): string | null {
  if (!entitlement || entitlement.currency !== 'CNY'
    || !Number.isSafeInteger(entitlement.amountCents) || entitlement.amountCents <= 0) return null
  return `¥${(entitlement.amountCents / 100).toFixed(2)}`
}

export function matchesPaymentAmount(order: Pick<PaymentOrderResponse, 'amountCents' | 'currency'>, entitlement?: CaseEntitlement): boolean {
  if (!formatPaymentPrice(entitlement)) return false
  const orderAmount = Number(order.amountCents)
  const entitlementAmount = Number(entitlement!.amountCents)
  return Number.isSafeInteger(orderAmount) && Number.isSafeInteger(entitlementAmount)
    && orderAmount === entitlementAmount && order.currency === entitlement!.currency
}

export function entitlementLabel(status?: CaseEntitlement['status']): string {
  if (status === 'paid') return '已解锁'
  if (status === 'pending') return '待确认'
  if (status === 'refunded') return '已退款'
  return '未付费'
}
