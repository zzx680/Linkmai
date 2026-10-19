import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveApiBase } from '../config/api-base'

test('website hosts cannot be used as API endpoints in any build', () => {
  for (const production of [false, true]) {
    for (const host of ['linkmai.com', 'www.linkmai.com', 'WWW.LINKMAI.COM']) {
      assert.throws(() => resolveApiBase(`https://${host}/api`, production), /网站域名/)
    }
  }
})

test('production requires a valid HTTPS address while local development remains available', () => {
  assert.equal(resolveApiBase('https://api.linkmai.com/api/', true), 'https://api.linkmai.com/api')
  assert.equal(resolveApiBase('https://staging.example.com/api', true), 'https://staging.example.com/api')
  assert.equal(resolveApiBase(undefined, false), 'http://localhost:8000/api')
  assert.throws(() => resolveApiBase(undefined, true), /HTTPS/)
  assert.throws(() => resolveApiBase('http://api.linkmai.com/api', true), /HTTPS/)
  assert.throws(() => resolveApiBase('invalid', true), /有效/)
})
