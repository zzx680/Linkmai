import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { Pool } from 'pg'
import { memoryDB as db } from '../src/db/memory'
import { db as postgresDB } from '../src/db/postgres'
import router from '../src/routes/payments'

async function call(userId: string, query: Record<string, unknown> = {}) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.get)
  let status = 200
  let body: any
  await layer.route.stack[0].handle({ userId, query }, {
    status(code: number) { status = code; return this },
    json(value: unknown) { body = value; return this },
  })
  return { status, body }
}

test('order center covers every status and archived case, excludes foreign orders and private provider fields', async () => {
  const owner = await db.createUser(`orders-${crypto.randomUUID()}`)
  const other = await db.createUser(`orders-other-${crypto.randomUUID()}`)
  const states = ['created', 'pending', 'paid', 'failed', 'closed', 'refunded'] as const
  const ids: string[] = []
  for (const [index, status] of states.entries()) {
    const item = await db.createCase(owner.id, `案件 ${index}`)
    const order = await db.createPaymentOrder({ userId: owner.id, caseId: item.id, amountCents: 4990, currency: 'CNY' })
    Object.assign(order, { status, prepayId: 'secret-prepay', wechatTransactionId: 'private-transaction', idempotencyKey: 'internal-key', createdAt: new Date(1000 + index) })
    ids.unshift(order.id)
    await db.deleteActiveCase(owner.id)
  }
  const foreignCase = await db.createCase(other.id, '其他账户')
  await db.createPaymentOrder({ userId: other.id, caseId: foreignCase.id, amountCents: 4990, currency: 'CNY' })
  const result = await call(owner.id, { limit: '2', offset: '0', userId: other.id })
  assert.equal(result.status, 200)
  assert.equal(result.body.hasMore, true)
  assert.equal(result.body.nextOffset, 2)
  const second = await call(owner.id, { limit: '2', offset: '2' })
  const third = await call(owner.id, { limit: '2', offset: '4' })
  const orders = [...result.body.orders, ...second.body.orders, ...third.body.orders]
  assert.deepEqual(orders.map(order => order.orderId), ids)
  assert.deepEqual(new Set(orders.map(order => order.status)), new Set(states))
  assert.equal(third.body.hasMore, false)
  for (const order of orders) {
    assert.equal(order.amountCents, 4990)
    assert.ok(order.orderNo)
    for (const key of ['userId', 'prepayId', 'wechatTransactionId', 'idempotencyKey']) assert.equal(order[key], undefined)
  }
})

test('invalid pagination is rejected without querying orders', async () => {
  const stub = mock.method(db, 'listPaymentOrders', async () => { throw new Error('must not query') })
  try {
    for (const query of [{ limit: '0' }, { limit: '51' }, { offset: '-1' }, { offset: '1.5' }, { offset: 'Infinity' }, { offset: '9007199254740992' }, { limit: ['1', '2'] }, { offset: {} }]) {
      assert.equal((await call('owner', query)).status, 400)
    }
    assert.equal(stub.mock.callCount(), 0)
  } finally { stub.mock.restore() }
})

test('PostgreSQL history scopes by authenticated owner and uses deterministic pagination without filtering statuses or active cases', async () => {
  const stub = mock.method(Pool.prototype, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /WHERE user_id = \$1 ORDER BY created_at DESC, id DESC LIMIT \$2 OFFSET \$3/)
    assert.doesNotMatch(sql, /is_active|status =|JOIN/)
    assert.deepEqual(values, ['owner', 21, 40])
    return { rows: [{ id: 'old-order', user_id: 'owner', case_id: 'archived', order_no: 'no', status: 'refunded' }] }
  })
  try {
    assert.equal((await postgresDB.listPaymentOrders('owner', 21, 40))[0].id, 'old-order')
  } finally { stub.mock.restore() }
})
