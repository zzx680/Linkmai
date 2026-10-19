import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { Pool } from 'pg'
import router from '../src/routes/privacy'
import { memoryDB } from '../src/db/memory'
import { db as postgresDB } from '../src/db/postgres'
import { managePrivacyRequests } from '../src/scripts/privacy-requests'

async function call(method: 'get' | 'post', userId?: string, body: unknown = {}) {
  const layer = (router as any).stack.find((item: any) => item.route?.path === '/requests' && item.route.methods[method])
  let status = 200
  let payload: any
  const res = { status(code: number) { status = code; return this }, json(value: unknown) { payload = value; return this } }
  await layer.route.stack[0].handle({ userId, body }, res)
  return { status, ...payload }
}

test('privacy requests require authentication and reject forged owners or statuses', async () => {
  assert.equal((await call('get')).status, 401)
  assert.equal((await call('post', undefined, { kind: 'close_account' })).status, 401)
  const user = await memoryDB.createUser(`privacy-validation-${Math.random()}`)
  for (const body of [null, {}, { kind: 'refund' }, { kind: 'close_account', userId: 'other' }, { kind: 'delete_data', status: 'completed' }]) {
    assert.equal((await call('post', user.id, body)).status, 400)
  }
  assert.equal((await call('post', 'missing', { kind: 'delete_data' })).status, 401)
})

test('duplicate concurrent requests are idempotent and private to their owner', async () => {
  const owner = await memoryDB.createUser(`privacy-owner-${Math.random()}`)
  const other = await memoryDB.createUser(`privacy-other-${Math.random()}`)
  const results = await Promise.all(Array.from({ length: 8 }, () => call('post', owner.id, { kind: 'close_account' })))
  assert.equal(new Set(results.map(item => item.data.id)).size, 1)
  assert.equal(results[0].data.status, 'pending')
  assert.equal(results[0].data.userId, undefined)
  assert.equal((await call('get', other.id)).data.length, 0)
  assert.equal((await call('get', owner.id)).data.length, 1)
  // An application is neither deletion nor logout: the user still exists.
  assert.ok(await memoryDB.findUserById(owner.id))
  await call('post', owner.id, { kind: 'export_data' })
  assert.equal((await call('get', owner.id)).data.length, 2)
})

test('PostgreSQL atomically deduplicates open requests and limits owner queries', async () => {
  const row = { id: 'request', user_id: 'owner', kind: 'delete_data', status: 'pending', response: null, created_at: new Date(), updated_at: new Date() }
  const queries: string[] = []
  const mocked = mock.method(Pool.prototype, 'query', async (sql: string, values: unknown[]) => {
    queries.push(sql)
    if (sql.includes('INSERT INTO')) {
      assert.deepEqual(values.slice(1), ['owner', 'delete_data'])
      assert.match(sql, /ON CONFLICT \(user_id, kind\) WHERE status IN \('pending', 'processing'\)/)
    } else {
      assert.match(sql, /WHERE user_id = \$1 ORDER BY created_at DESC LIMIT 20/)
      assert.deepEqual(values, ['owner'])
    }
    return { rows: [row] }
  })
  try {
    assert.equal((await postgresDB.createPrivacyRequest('owner', 'delete_data')).id, 'request')
    assert.equal((await postgresDB.getPrivacyRequestsByUser('owner'))[0].userId, 'owner')
    assert.equal(queries.length, 2)
  } finally { mocked.mock.restore() }
})

test('operator tool requires a reply, parameterizes updates, and cannot reopen closed requests', async () => {
  await assert.rejects(managePrivacyRequests(['respond', 'id', 'completed', ' ']), /用法/)
  await assert.rejects(managePrivacyRequests(['respond', 'id', 'pending', 'reply']), /用法/)
  const mocked = mock.method(Pool.prototype, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /WHERE id = \$1 AND status IN \('pending', 'processing'\)/)
    assert.deepEqual(values, ['id', 'processing', "待核验 ' 文本"])
    assert.doesNotMatch(sql, /DELETE|DROP/)
    return { rows: [] }
  })
  try { await assert.rejects(managePrivacyRequests(['respond', 'id', 'processing', "待核验 ' 文本"]), /不存在或已结案/) }
  finally { mocked.mock.restore() }
})
