import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { entitlementLabel, formatPaymentPrice, matchesPendingPayment, paymentConfirmation } from '../src/utils/payment'
import type { CaseEntitlement, PaymentOrder } from '../src/services/api'

describe('payment presentation and recovery', () => {
  it('only reports paid from the order and preserves refunded terminal state', () => {
    const order = (status: PaymentOrder['status']): PaymentOrder => ({ orderId: 'o', caseId: 'c', status })
    assert.equal(paymentConfirmation(order('paid')), 'paid')
    assert.equal(paymentConfirmation(order('pending')), 'pending')
    assert.equal(paymentConfirmation(order('created')), 'pending')
    assert.equal(paymentConfirmation(order('failed')), 'failed')
    assert.equal(paymentConfirmation(order('closed')), 'failed')
    assert.equal(paymentConfirmation({ ...order('refunded'), entitlement: { status: 'paid', amountCents: 1, currency: 'CNY' } }), 'refunded')
    assert.equal(paymentConfirmation({ ...order('pending'), entitlement: { status: 'paid', amountCents: 1, currency: 'CNY' } }), 'pending')
  })

  it('rejects pending orders from another user or case and malformed storage', () => {
    const pending = { userId: 'u', caseId: 'c', orderId: 'o' }
    assert.equal(matchesPendingPayment(pending, 'u', 'c'), true)
    assert.equal(matchesPendingPayment(pending, 'other', 'c'), false)
    assert.equal(matchesPendingPayment(pending, 'u', 'other'), false)
    for (const value of [null, 'o', {}, { caseId: 'c', orderId: 'o' }, { ...pending, orderId: '' }]) {
      assert.equal(matchesPendingPayment(value, 'u', 'c'), false)
    }
  })

  it('uses the server amount without an invented default', () => {
    const entitlement: CaseEntitlement = { status: 'unpaid', amountCents: 1, currency: 'CNY' }
    assert.equal(formatPaymentPrice(entitlement), '¥0.01')
    assert.equal(formatPaymentPrice({ ...entitlement, amountCents: 4990 }), '¥49.90')
    assert.equal(formatPaymentPrice(), null)
    for (const amountCents of [0, -1, NaN, Infinity, 1.5]) {
      assert.equal(formatPaymentPrice({ ...entitlement, amountCents }), null)
    }
    assert.equal(formatPaymentPrice({ ...entitlement, currency: 'USD' }), null)
  })

  it('shows supported entitlement labels', () => {
    assert.equal(entitlementLabel('paid'), '已解锁')
    assert.equal(entitlementLabel('pending'), '待确认')
    assert.equal(entitlementLabel('refunded'), '已退款')
    assert.equal(entitlementLabel('unpaid'), '未付费')
  })
})
