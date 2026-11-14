import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import * as chatStream from '../src/services/chat-stream'

const source = path.resolve(__dirname, '../src/services/api.ts')
const localRequire = createRequire(source)
const compiled = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText

function fixture(streaming = true) {
  let token: string | null = 'test-token'
  let chunk: ((event: { data: ArrayBuffer }) => void) | undefined
  const calls: any[] = []
  const tasks: Array<{ succeed: (data: unknown, statusCode?: number) => void; fail: () => void }> = []
  const taro = {
    ENV_TYPE: { WEAPP: 'WEAPP' }, getEnv: () => 'WEAPP', canIUse: () => streaming,
    getStorageSync: () => token, removeStorageSync: () => { token = null },
    request(options: any) {
      calls.push(options)
      let resolve!: (value: any) => void
      let reject!: (error: any) => void
      const promise = new Promise((done, fail) => { resolve = done; reject = fail })
      tasks.push({
        succeed(data, statusCode = 200) {
          const response = { data, statusCode }
          options.success?.(response)
          resolve(response)
        },
        fail() { const error = { errMsg: 'request:fail timeout' }; options.fail?.(error); reject(error) },
      })
      return Object.assign(promise, { onChunkReceived(callback: typeof chunk) { chunk = callback } })
    },
  }
  const module = { exports: {} as any }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, Error,
    require(id: string) {
      if (id === '@tarojs/taro') return taro
      if (id === '../config/env') return { getApiBase: () => 'https://api.test/api' }
      if (id === './chat-stream') return chatStream
      return localRequire(id)
    },
  }, { filename: source })
  const deltas: string[] = []
  const send = () => module.exports.sendMessageStream('case', '你好', undefined, undefined, 'stable-request', (text: string) => deltas.push(text))
  const bytes = (text: string, size = 7) => {
    const buffer = Buffer.from(text)
    for (let start = 0; start < buffer.length; start += size) {
      const part = Uint8Array.from(buffer.subarray(start, start + size))
      chunk?.({ data: part.buffer })
    }
  }
  return { api: module.exports, send, deltas, calls, tasks, bytes, token: () => token }
}

const frame = (type: string, data: unknown) => `event: ${type}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`

test('client consumes named backend events incrementally with Chinese and emoji split at every byte boundary', async () => {
  for (const size of [1, 2, 7, 64]) {
    const test = fixture()
    const pending = test.send()
    assert.equal(test.calls[0].enableChunked, true)
    assert.equal(test.calls[0].header.Authorization, 'Bearer test-token')
    test.bytes(': heartbeat\r\n\r\n' + frame('start', {}) + frame('delta', { delta: '事故🚗' }), size)
    assert.deepEqual(test.deltas, ['事故🚗'])
    test.bytes(frame('delta', { delta: '已收到' }) + frame('done', { success: true, data: { message: '事故🚗已收到' } }), size)
    assert.equal((await pending).message, '事故🚗已收到')
    test.tasks[0].succeed('')
    assert.deepEqual(test.deltas, ['事故🚗', '已收到'])
  }
})

test('client preserves conflict status for store recovery and ignores events after termination', async () => {
  const test = fixture()
  const pending = test.send()
  const rejected = assert.rejects(pending, (error: any) => error.statusCode === 409 && error.code === 'CONVERSATION_STALE')
  test.bytes(frame('delta', { delta: '部分回复' }) + frame('error', { statusCode: 409, code: 'CONVERSATION_STALE', error: '案件信息已更新' }))
  test.bytes(frame('delta', { delta: '不应显示' }) + frame('done', { data: { message: '不应成功' } }))
  test.tasks[0].succeed('')
  await rejected
  assert.deepEqual(test.deltas, ['部分回复'])
})

test('client rejects incomplete, malformed and timed-out streams', async () => {
  for (const mode of ['incomplete', 'malformed', 'timeout']) {
    const test = fixture()
    const pending = test.send()
    const rejected = assert.rejects(pending, (error: any) => error.statusCode === 0)
    test.bytes(mode === 'malformed' ? 'event: delta\ndata: invalid\n\n' : frame('delta', { delta: '草稿' }))
    if (mode === 'timeout') test.tasks[0].fail()
    else test.tasks[0].succeed('')
    await rejected
  }
})

test('client handles buffered SSE, regular JSON from older backends and expired login', async () => {
  const buffered = fixture()
  const first = buffered.send()
  buffered.tasks[0].succeed(frame('delta', { delta: '缓冲回复' }) + frame('done', { data: { message: '缓冲回复' } }))
  assert.equal((await first).message, '缓冲回复')
  const old = fixture()
  const second = old.send()
  old.tasks[0].succeed(JSON.stringify({ success: true, data: { message: '旧后端回复' } }))
  assert.equal((await second).message, '旧后端回复')
  const expired = fixture()
  let invalidated = 0
  expired.api.setUnauthorizedHandler(() => invalidated++)
  const third = expired.send()
  const rejected = assert.rejects(third, (error: any) => error.statusCode === 401)
  expired.tasks[0].succeed('{"error":"expired"}', 401)
  await rejected
  assert.equal(expired.token(), null)
  assert.equal(invalidated, 1)
})

test('unsupported chunked requests use the normal endpoint with the same request ID', async () => {
  const test = fixture(false)
  const pending = test.send()
  assert.equal(test.calls[0].enableChunked, undefined)
  assert.equal(test.calls[0].data.requestId, 'stable-request')
  assert.equal(test.calls[0].data.stream, undefined)
  test.tasks[0].succeed({ success: true, data: { message: '普通回复' } })
  assert.equal((await pending).message, '普通回复')
  assert.deepEqual(test.deltas, [])
})
