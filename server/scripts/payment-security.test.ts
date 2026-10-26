import assert from 'node:assert/strict'
import { beforeEach, afterEach, mock, test } from 'node:test'
import { config } from '../src/config'
import { memoryDB as db } from '../src/db/memory'
import { paymentProvider, type ProviderOrder, type VerifiedPaymentNotification } from '../src/services/payment/provider'
import { createCasePaymentOrder, processPaymentNotification, queryPaymentOrder } from '../src/services/payment'

const previous = { ...config.payment.wechat }
beforeEach(() => Object.assign(config.payment.wechat, { appId: 'wx-app', mchId: '1234567890' }))
afterEach(() => { mock.restoreAll(); Object.assign(config.payment.wechat, previous) })

async function fixture() {
  const user = await db.createUser(`payment-${crypto.randomUUID()}`)
  const item = await db.createCase(user.id, '支付安全回归')
  const order = await db.createPaymentOrder({ caseId: item.id, userId: user.id, amountCents: 4990, currency: 'CNY' })
  const provider: ProviderOrder = {
    orderNo: order.orderNo, transactionId: `txn-${crypto.randomUUID()}`, tradeState: 'SUCCESS',
    amountCents: order.amountCents, currency: order.currency, appId: 'wx-app', mchId: '1234567890', userId: user.id,
  }
  return { user, item, order, provider }
}

function notify(provider: ProviderOrder, extra: Partial<VerifiedPaymentNotification> = {}) {
  mock.method(paymentProvider, 'verifyNotification', () => ({ ...provider, ...extra }))
  return processPaymentNotification({}, Buffer.from('{}'))
}

test('forged amount, app, merchant and user never grant access; foreign orders stay private', async () => {
  const { user, item, order, provider } = await fixture()
  for (const altered of [{ amountCents: 1 }, { appId: 'other' }, { mchId: 'other' }, { userId: 'other' }]) {
    mock.method(paymentProvider, 'queryOrder', async () => ({ ...provider, ...altered }))
    await assert.rejects(queryPaymentOrder(user.id, order.id), /MISMATCH/)
    assert.notEqual((await db.getCaseEntitlement(user.id, item.id))?.status, 'paid')
    mock.restoreAll()
  }
  await assert.rejects(queryPaymentOrder('someone-else', order.id), /ORDER_NOT_FOUND/)
})

test('successful notifications are idempotent and a transaction cannot unlock a second case', async () => {
  const first = await fixture()
  assert.equal((await notify(first.provider)).paid, true)
  assert.equal((await notify(first.provider)).paid, true)
  const second = await fixture()
  await assert.rejects(notify({ ...second.provider, transactionId: first.provider.transactionId }), /TRANSACTION_ALREADY_USED/)
  assert.notEqual((await db.getCaseEntitlement(second.user.id, second.item.id))?.status, 'paid')
})

test('expired USERPAYING stays unresolved and cannot create or launch another order', async () => {
  const { user, item, order, provider } = await fixture()
  order.expiresAt = new Date(Date.now() - 1000)
  mock.method(paymentProvider, 'queryOrder', async () => ({ ...provider, tradeState: 'USERPAYING' }))
  const create = mock.method(paymentProvider, 'createOrder', async () => { throw new Error('must not create') })
  await assert.rejects(createCasePaymentOrder(user.id, item.id, user.openid, 'fresh-key'), /PAYMENT_CONFIRMATION_PENDING/)
  assert.equal(create.mock.callCount(), 0)
  assert.equal((await db.createPaymentOrder({ caseId: item.id, userId: user.id, amountCents: 4990, currency: 'CNY' }))?.id, order.id)
})

test('a payment racing with close cannot create a replacement before confirmation', async () => {
  const { user, item, order, provider } = await fixture()
  order.expiresAt = new Date(Date.now() - 1000)
  mock.method(paymentProvider, 'queryOrder', async () => ({ ...provider, tradeState: 'NOTPAY' }))
  mock.method(paymentProvider, 'closeOrder', async () => { throw new Error('ALREADY_PAID') })
  await assert.rejects(createCasePaymentOrder(user.id, item.id, user.openid), /ALREADY_PAID/)
  assert.equal(order.status, 'created')
})

test('a failed create must not close an unexpired order when WeChat says NOTPAY', async () => {
  const { user, item, order, provider } = await fixture()
  await db.updatePaymentOrderStatus(order.id, 'closed')
  let createdOrderNo = ''
  const close = mock.method(paymentProvider, 'closeOrder', async () => { throw new Error('must not close an active order') })
  mock.method(paymentProvider, 'createOrder', async (input) => {
    createdOrderNo = input.orderNo
    throw new Error('provider timeout after creating the order')
  })
  mock.method(paymentProvider, 'queryOrder', async (orderNo) => ({ ...provider, orderNo, tradeState: 'NOTPAY' }))
  await assert.rejects(createCasePaymentOrder(user.id, item.id, user.openid), /PAYMENT_CONFIRMATION_PENDING/)
  const recovered = await db.findPaymentOrderByOrderNo(createdOrderNo)
  assert.equal(recovered?.status, 'created')
  assert.equal(close.mock.callCount(), 0)
  assert.equal((await db.getCaseEntitlement(user.id, item.id))?.status, 'pending')
})

test('an uncertain provider response keeps the order pending instead of allowing a second order', async () => {
  const { user, item, order } = await fixture()
  await db.updatePaymentOrderStatus(order.id, 'closed')
  let createdOrderNo = ''
  mock.method(paymentProvider, 'createOrder', async (input) => {
    createdOrderNo = input.orderNo
    throw new Error('provider timeout')
  })
  mock.method(paymentProvider, 'queryOrder', async () => { throw new Error('PAYMENT_PROVIDER_ERROR') })
  await assert.rejects(createCasePaymentOrder(user.id, item.id, user.openid), /PAYMENT_CONFIRMATION_PENDING/)
  const recovered = await db.findPaymentOrderByOrderNo(createdOrderNo)
  assert.equal(recovered?.status, 'created')
  await assert.rejects(createCasePaymentOrder(user.id, item.id, user.openid), /PAYMENT_CONFIRMATION_PENDING/)
  assert.equal((await db.findPendingPaymentOrder(user.id, item.id))?.orderNo, createdOrderNo)
})

test('the same recovery path closes a genuinely expired NOTPAY order', async () => {
  const { user, item, provider, order } = await fixture()
  await db.updatePaymentOrderStatus(order.id, 'closed')
  let createdOrderNo = ''
  const close = mock.method(paymentProvider, 'closeOrder', async () => undefined)
  mock.method(paymentProvider, 'createOrder', async (input) => {
    createdOrderNo = input.orderNo
    const created = await db.findPaymentOrderByOrderNo(input.orderNo)
    created!.expiresAt = new Date(Date.now() - 1000)
    throw new Error('provider timeout')
  })
  mock.method(paymentProvider, 'queryOrder', async (orderNo) => ({ ...provider, orderNo, tradeState: 'NOTPAY' }))
  await assert.rejects(createCasePaymentOrder(user.id, item.id, user.openid), /provider timeout/)
  assert.equal((await db.findPaymentOrderByOrderNo(createdOrderNo))?.status, 'closed')
  assert.equal(close.mock.callCount(), 1)
  assert.equal((await db.getCaseEntitlement(user.id, item.id))?.status, 'unpaid')
})

test('replaying a terminal idempotency key cannot re-open or submit the closed order', async () => {
  const { user, item, order, provider } = await fixture()
  order.idempotencyKey = 'same-key'
  // Create the keyed order after closing the fixture's unkeyed order.
  await db.updatePaymentOrderStatus(order.id, 'closed')
  const keyed = await db.createPaymentOrder({ caseId: item.id, userId: user.id, amountCents: 4990, currency: 'CNY', idempotencyKey: 'same-key' })
  await db.updatePaymentOrderStatus(keyed.id, 'closed')
  mock.method(paymentProvider, 'queryOrder', async () => ({ ...provider, orderNo: keyed.orderNo, tradeState: 'CLOSED' }))
  const create = mock.method(paymentProvider, 'createOrder', async () => { throw new Error('must not create') })
  await assert.rejects(createCasePaymentOrder(user.id, item.id, user.openid, 'same-key'), /ORDER_NOT_PAYABLE/)
  assert.equal(create.mock.callCount(), 0)
})

test('concurrent creation keeps one pending order even with distinct request keys', async () => {
  const { user, item, order } = await fixture()
  await db.updatePaymentOrderStatus(order.id, 'closed')
  const input = { caseId: item.id, userId: user.id, amountCents: 4990, currency: 'CNY' }
  const orders = await Promise.all(Array.from({ length: 10 }, (_, n) => db.createPaymentOrder({ ...input, idempotencyKey: `key-${n}` })))
  assert.equal(new Set(orders.map(value => value.id)).size, 1)
})

test('new and reused prepay responses expose the actual immutable order amount', async () => {
  const user = await db.createUser(`price-${crypto.randomUUID()}`)
  const item = await db.createCase(user.id, '金额核对')
  const payment = { timeStamp: '1', nonceStr: 'n', package: 'prepay_id=p', signType: 'RSA' as const, paySign: 's' }
  mock.method(paymentProvider, 'createOrder', async () => ({ prepayId: 'p', payment }))
  mock.method(paymentProvider, 'createPaymentParams', () => payment)
  const first = await createCasePaymentOrder(user.id, item.id, user.openid)
  assert.equal(first.amountCents, config.payment.amountCents)
  assert.equal(first.currency, 'CNY')
  const entitlement = await db.getCaseEntitlement(user.id, item.id)
  entitlement!.amountCents = first.amountCents! + 1000
  mock.method(paymentProvider, 'queryOrder', async () => ({
    orderNo: first.orderNo!, tradeState: 'NOTPAY', amountCents: first.amountCents!, currency: 'CNY', appId: 'wx-app', mchId: '1234567890',
  }))
  const reused = await createCasePaymentOrder(user.id, item.id, user.openid, 'retry')
  assert.equal(reused.orderId, first.orderId)
  assert.equal(reused.amountCents, first.amountCents)
  assert.equal(reused.currency, first.currency)
  assert.equal((await db.getCaseEntitlement(user.id, item.id))?.amountCents, first.amountCents)
})

test('partial refunds and REFUND query state keep access; verified full refund revokes it', async () => {
  const { user, item, order, provider } = await fixture()
  await notify(provider)
  mock.restoreAll()
  mock.method(paymentProvider, 'queryOrder', async () => ({ ...provider, tradeState: 'REFUND' }))
  assert.equal((await queryPaymentOrder(user.id, order.id)).entitlement.status, 'paid')
  const refund = { eventType: 'REFUND.SUCCESS', tradeState: 'REFUND', tradeStateDescription: 'SUCCESS', refundAmountCents: 100 }
  await notify(provider, refund)
  assert.equal((await db.getCaseEntitlement(user.id, item.id))?.status, 'paid')
  await notify(provider, { ...refund, refundAmountCents: 4990 })
  await notify(provider, { ...refund, refundAmountCents: 4990 })
  assert.equal((await db.getCaseEntitlement(user.id, item.id))?.status, 'refunded')
})

test('refund amount and merchant are checked before any entitlement is revoked', async () => {
  const { user, item, provider } = await fixture()
  await notify(provider)
  for (const altered of [{ mchId: 'other' }, { currency: 'USD' }, { amountCents: 1 }, { refundAmountCents: 5000 }, { transactionId: 'other' }]) {
    await assert.rejects(notify(provider, { eventType: 'REFUND.SUCCESS', tradeState: 'REFUND', tradeStateDescription: 'SUCCESS', refundAmountCents: 4990, ...altered }), /MISMATCH/)
    assert.equal((await db.getCaseEntitlement(user.id, item.id))?.status, 'paid')
  }
})

test('replayed old refund and late prepay response do not downgrade a newer paid entitlement', async () => {
  const { user, item, order, provider } = await fixture()
  await notify(provider)
  const refund = { eventType: 'REFUND.SUCCESS', tradeState: 'REFUND', tradeStateDescription: 'SUCCESS', refundAmountCents: 4990 }
  await notify(provider, refund)
  const next = await db.createPaymentOrder({ caseId: item.id, userId: user.id, amountCents: 4990, currency: 'CNY' })
  await db.completePaymentOrder({ orderNo: next.orderNo, userId: user.id, amountCents: 4990, currency: 'CNY', wechatTransactionId: 'new-transaction' })
  await notify(provider, refund)
  await assert.rejects(db.setPaymentOrderPrepay(order.id, 'late-prepay'), /ORDER_NOT_FOUND/)
  assert.equal((await db.getCaseEntitlement(user.id, item.id))?.status, 'paid')
})

test('unpaid or refunded current-case responses cannot expose paid report conclusions', async () => {
  const casesRouter = require('../src/routes/cases').default
  const { user, item } = await fixture()
  await db.updateCase(user.id, { liability: 'paid finding', compensation: 'paid estimate' }, item.id)
  const layer = casesRouter.stack.find((entry: any) => entry.route?.path === '/current' && entry.route.methods.get)
  let body: any
  await layer.route.stack.at(-1).handle({ userId: user.id }, { json(value: any) { body = value } })
  assert.equal(body.data.liability, null)
  assert.equal(body.data.compensation, null)
})
