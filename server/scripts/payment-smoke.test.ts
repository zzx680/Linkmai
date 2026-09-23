import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoryDB } from '../src/db/memory'
import { requirePaidEntitlement } from '../src/services/payment'

test('payment order is idempotent and grants entitlement only after payment', async () => {
  const user = await memoryDB.createUser(`payment-test-${Date.now()}`)
  const caseData = await memoryDB.createCase(user.id, '支付回归测试')
  const input = {
    caseId: caseData.id,
    userId: user.id,
    amountCents: 4990,
    currency: 'CNY',
    idempotencyKey: `payment-test-${Date.now()}`,
  }

  const firstOrder = await memoryDB.createPaymentOrder(input)
  const retryOrder = await memoryDB.createPaymentOrder(input)
  assert.equal(retryOrder.id, firstOrder.id)
  assert.equal(firstOrder.status, 'created')
  await assert.rejects(requirePaidEntitlement(user.id, caseData.id), { message: 'PAYMENT_REQUIRED' })

  const paidOrder = await memoryDB.completePaymentOrder({
    orderNo: firstOrder.orderNo,
    userId: user.id,
    amountCents: firstOrder.amountCents,
    currency: firstOrder.currency,
    wechatTransactionId: `transaction-${Date.now()}`,
  })
  assert.equal(paidOrder.status, 'paid')
  assert.equal((await requirePaidEntitlement(user.id, caseData.id)).status, 'paid')

  const nextCase = await memoryDB.createCase(user.id, '关闭订单回归测试')
  const closedOrder = await memoryDB.createPaymentOrder({
    caseId: nextCase.id,
    userId: user.id,
    amountCents: 4990,
    currency: 'CNY',
  })
  const replacementCase = await memoryDB.createCase(user.id, '新案件')
  assert.equal((await memoryDB.findPaymentOrderById(user.id, closedOrder.id))?.status, 'closed')
  const latePayment = await memoryDB.completePaymentOrder({
    orderNo: closedOrder.orderNo,
    userId: user.id,
    amountCents: closedOrder.amountCents,
    currency: closedOrder.currency,
    wechatTransactionId: `late-transaction-${Date.now()}`,
  })
  assert.equal(latePayment.status, 'paid')
  assert.equal((await memoryDB.getCaseEntitlement(user.id, nextCase.id))?.status, 'paid')
  assert.equal(replacementCase.isActive, true)
})
