import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import axios from 'axios'
import { config } from '../src/config'
import { streamDeepSeek } from '../src/services/deepseek'
import { Readable } from 'node:stream'

test('streamDeepSeek forwards DeepSeek deltas and reconstructs the complete reply', async () => {
  const previousKey = config.deepseek.apiKey
  config.deepseek.apiKey = 'stream-test-key'
  const provider = mock.method(axios, 'post', async () => ({
    data: (async function* () {
      yield 'data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n'
      yield 'data: {"choices":[{"delta":{"content":"第二段"}}]}\n\n'
      yield 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
      yield 'data: [DONE]\n\n'
    })(),
  }))
  try {
    const deltas: string[] = []
    const result = await streamDeepSeek([{ role: 'user', content: '测试' }], delta => deltas.push(delta))
    assert.equal(result, '第一段第二段')
    assert.deepEqual(deltas, ['第一段', '第二段'])
    const [, body, options] = provider.mock.calls[0].arguments as unknown as [string, any, any]
    assert.equal(body.stream, true)
    assert.equal(options.responseType, 'stream')
  } finally {
    provider.mock.restore()
    config.deepseek.apiKey = previousKey
  }
})

test('streamDeepSeek preserves UTF-8 and CRLF across every byte boundary', async () => {
  const body = Buffer.from(': keepalive\r\n\r\ndata: {"choices":[{"delta":{"content":"处理事故🚗"}}]}\r\n\r\ndata: {"choices":[{"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n')
  const provider = mock.method(axios, 'post', async () => ({ data: Readable.from([...body].map(byte => Buffer.from([byte]))) }))
  try {
    const deltas: string[] = []
    assert.equal(await streamDeepSeek([], text => deltas.push(text)), '处理事故🚗')
    assert.deepEqual(deltas, ['处理事故🚗'])
  } finally { provider.mock.restore() }
})

test('streamDeepSeek rejects incomplete, truncated, malformed, empty and failed streams', async () => {
  const delta = 'data: {"choices":[{"delta":{"content":"部分回复"}}]}\n\n'
  const stop = 'data: {"choices":[{"finish_reason":"stop"}]}\n\n'
  const done = 'data: [DONE]\n\n'
  for (const body of [delta, delta + done, delta + stop, done, delta + 'data: invalid\n\n' + done,
    delta + 'data: {"error":{"message":"failed"}}\n\n',
    delta + 'data: {"choices":[{"finish_reason":"length"}]}\n\n' + done]) {
    const stream = Readable.from([Buffer.from(body)])
    const provider = mock.method(axios, 'post', async () => ({ data: stream }))
    try {
      await assert.rejects(streamDeepSeek([], () => undefined))
      assert.equal(stream.destroyed, true)
    } finally { provider.mock.restore() }
  }
})

test('streamDeepSeek aborts and closes a stalled upstream at the overall deadline', async () => {
  const stream = new Readable({ read() {} })
  const provider = mock.method(axios, 'post', async (_url: unknown, _body: unknown, options: any) => {
    options.signal.addEventListener('abort', () => stream.destroy(new Error('deadline exceeded')), { once: true })
    return { data: stream }
  })
  try {
    await assert.rejects(streamDeepSeek([], () => undefined, { timeoutMs: 30 }), /deadline exceeded/)
    assert.equal(stream.destroyed, true)
  } finally { provider.mock.restore() }
})
