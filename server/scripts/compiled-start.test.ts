import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import path from 'node:path'

test('compiled CommonJS server boots and serves health without external services', async () => {
  const port = 18267
  const child = spawn(process.execPath, [path.resolve(__dirname, '../dist/index.js')], {
    env: { ...process.env, DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'test', DB_TYPE: 'memory', HOST: '127.0.0.1', PORT: String(port), PAYMENT_PROVIDER: 'disabled', ALLOW_MOCK_WECHAT_LOGIN: 'false', HARNESS_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`startup timed out: ${output}`)), 10000)
      const read = (chunk: Buffer) => {
        output += chunk.toString()
        if (output.includes('监听地址')) { clearTimeout(timer); resolve() }
      }
      child.stdout.on('data', read)
      child.stderr.on('data', read)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${output}`)) })
    })
    const response = await fetch(`http://127.0.0.1:${port}/api/health`)
    assert.equal(response.status, 200)
    const body = await response.json() as { status: string }
    assert.equal(body.status, 'ok')

    const notification = await fetch(`http://127.0.0.1:${port}/api/payments/wechat/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(notification.status, 400)
    assert.deepEqual(await notification.json(), { code: 'FAIL', message: '通知校验失败' })

    const sameOrigin = `http://127.0.0.1:${port}`
    const review = await fetch(`${sameOrigin}/api/review/login`, {
      method: 'POST', headers: { Origin: sameOrigin, 'Content-Type': 'application/json' }, body: '{}',
    })
    // The disabled feature returns 503, proving same-origin requests reach its guard.
    assert.equal(review.status, 503)
    assert.equal(review.headers.get('access-control-allow-origin'), sameOrigin)
    const foreignReview = await fetch(`${sameOrigin}/api/review/login`, {
      method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}',
    })
    assert.equal(foreignReview.status, 403)

    const preflight = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:10123',
        'Access-Control-Request-Method': 'POST',
      },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:10123')
  } finally {
    if (child.exitCode === null) {
      const stopped = new Promise<void>(resolve => child.once('exit', () => resolve()))
      child.kill('SIGTERM')
      await stopped
    }
  }
})
