import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'

const requireLocal = createRequire(__filename)
const loader = requireLocal('../scripts/native-chat-template-loader.cjs')

function compile(source: string, resourcePath: string, fail = false) {
  const imports: string[] = []
  return new Promise<{ result: string; imports: string[] }>((resolve, reject) => {
    loader.call({
      resourcePath, cacheable() {},
      async: () => (error: Error | null, result: string) => error ? reject(error) : resolve({ result, imports }),
      importModule: async (request: string) => {
        imports.push(request)
        if (fail) throw new Error('missing dependency')
      },
    }, source)
  })
}

test('TDesign dynamic URLs compile while static WXS and templates stay in the graph', async () => {
  const source = '<image src="{{item.url}}"/><image src="{{ok ? a : b}}"/><image src="/img/{{name}}.png"/>' +
    '<image src="https://example.com/a.png"/><wxs src="../common/utils.wxs" module="_"/>' +
    '<import src="./item.wxml"/><image src="./fallback.png"/>'
  const result = await compile(source, path.resolve('node_modules/tdesign-miniprogram/attachments.wxml'))
  assert.equal(result.result, source)
  assert.deepEqual(result.imports, ['../common/utils.wxs', './item.wxml', './fallback.png'])
})

test('non-TDesign templates keep the original Taro loader behavior', async () => {
  const source = '<wxs src="./utils.wxs" module="_"/><image src="{{url}}"/>'
  const result = await compile(source, path.resolve('src/components/example.wxml'))
  assert.equal(result.result, source)
  assert.deepEqual(result.imports, ['./utils.wxs'])
})

test('missing native template dependencies fail the build', async () => {
  await assert.rejects(compile('<wxs src="./missing.wxs"/>',
    path.resolve('node_modules/tdesign-miniprogram/chat.wxml'), true), /missing dependency/)
})
