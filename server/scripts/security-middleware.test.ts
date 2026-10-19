import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import jwt from 'jsonwebtoken'
import { createRateLimiter } from '../src/middleware/security'
import { authMiddleware } from '../src/middleware/auth'
import { config } from '../src/config'

function response() {
  return { statusCode: 200, setHeader() {}, status(value: number) { this.statusCode = value; return this }, json() { return this } }
}

test('rate limits authenticated users separately behind a shared IP and cap unique keys', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, maxKeys: 2 })
  const call = (userId: string, ip = 'same-ip') => { const res = response(); limiter({ userId, ip } as any, res as any, () => {}); return res.statusCode }
  assert.equal(call('first'), 200)
  assert.equal(call('first', 'another-ip'), 429)
  assert.equal(call('second'), 200)
  assert.equal(call('third'), 429)
})

test('expired rate-limit entries are reclaimed rather than growing without bound', () => {
  let now = 1000
  const clock = mock.method(Date, 'now', () => now)
  try {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, maxKeys: 1 })
    const call = (ip: string) => { const res = response(); limiter({ ip, socket: {} } as any, res as any, () => {}); return res.statusCode }
    assert.equal(call('first'), 200)
    assert.equal(call('second'), 429)
    now += 1001
    assert.equal(call('second'), 200)
  } finally { clock.mock.restore() }
})

test('authentication rejects malformed signed claims and unexpected algorithms', () => {
  for (const token of [jwt.sign({}, config.jwtSecret), jwt.sign({ userId: 'u', openid: {} }, config.jwtSecret), jwt.sign({ userId: 'u', openid: 'o' }, config.jwtSecret, { algorithm: 'HS384' })]) {
    const res = response(); let called = false
    authMiddleware({ headers: { authorization: `Bearer ${token}` } } as any, res as any, () => { called = true })
    assert.equal(res.statusCode, 401); assert.equal(called, false)
  }
  let called = false
  authMiddleware({ headers: { authorization: `Bearer ${jwt.sign({ userId: 'u', openid: 'o' }, config.jwtSecret)}` } } as any, response() as any, () => { called = true })
  assert.equal(called, true)
})
