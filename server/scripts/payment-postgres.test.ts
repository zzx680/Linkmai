import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { Pool } from 'pg'
import { db } from '../src/db/postgres'

const input = { caseId: 'case', userId: 'owner', amountCents: 4990, currency: 'CNY' }

test('PostgreSQL rejects foreign-case order creation before any insert', async () => {
  const calls: string[] = []
  const stub = mock.method(Pool.prototype, 'connect', async () => ({ query: async (sql: string) => { calls.push(sql); return { rows: [] } }, release() {} }))
  try {
    await assert.rejects(db.createPaymentOrder(input), /CASE_NOT_FOUND/)
    assert.ok(calls.includes('ROLLBACK'))
    assert.ok(!calls.some(sql => sql.includes('INSERT')))
  } finally { stub.mock.restore() }
})

test('PostgreSQL keeps an expired unresolved order under the case lock', async () => {
  const row = { id: 'existing', status: 'pending', expires_at: new Date(0) }
  const stub = mock.method(Pool.prototype, 'connect', async () => ({
    query: async (sql: string) => {
      if (sql.startsWith('SELECT id FROM cases')) return { rows: [{ id: 'case' }] }
      if (sql.includes('SELECT * FROM payment_orders')) {
        assert.match(sql, /FOR UPDATE/)
        assert.doesNotMatch(sql, /expires_at > NOW/)
        return { rows: [row] }
      }
      assert.ok(!sql.includes('INSERT'))
      return { rows: [] }
    }, release() {},
  }))
  try { assert.equal((await db.createPaymentOrder(input))?.id, 'existing') }
  finally { stub.mock.restore() }
})

test('PostgreSQL refunds lock the case and retain access when another paid order exists', async () => {
  const calls: string[] = []
  const stub = mock.method(Pool.prototype, 'connect', async () => ({
    query: async (sql: string) => {
      calls.push(sql)
      if (sql.startsWith('SELECT case_id')) return { rows: [{ case_id: 'case' }] }
      if (sql.startsWith('UPDATE payment_orders')) return { rows: [{ id: 'order', case_id: 'case', status: 'refunded' }] }
      return { rows: [] }
    }, release() {},
  }))
  try {
    await db.refundPaymentOrder('order')
    assert.ok(calls.findIndex(sql => sql.includes('FOR UPDATE')) < calls.findIndex(sql => sql.startsWith('UPDATE payment_orders')))
    assert.match(calls.find(sql => sql.includes('UPDATE case_entitlements'))!, /NOT EXISTS[\s\S]*status = 'paid'/)
  } finally { stub.mock.restore() }
})
