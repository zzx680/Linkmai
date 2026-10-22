import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import { PRIVACY_VERSION } from '../src/content/privacy'

function fixture() {
  const storage = new Map<string, string>()
  const prompts: string[] = []
  const routes: string[] = []
  let confirm = true
  const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '../src/utils/privacy-consent.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText
  const module = { exports: {} as any }
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(id: string) {
      if (id === '../content/privacy') return { PRIVACY_VERSION }
      if (id === '@tarojs/taro') return {
        getStorageSync: (key: string) => storage.get(key),
        setStorageSync: (key: string, value: string) => storage.set(key, value),
        removeStorageSync: (key: string) => storage.delete(key),
        showModal: async (options: { title: string; confirmText: string; cancelText: string }) => {
          assert.ok(options.confirmText.length <= 4, 'WeChat modal confirmText accepts at most 4 characters')
          assert.ok(options.cancelText.length <= 4, 'WeChat modal cancelText accepts at most 4 characters')
          prompts.push(options.title)
          return { confirm }
        },
        navigateTo: async (options: { url: string }) => { routes.push(options.url) }
      }
      throw new Error(id)
    }
  })
  return { api: module.exports, storage, prompts, routes, choose: (value: boolean) => { confirm = value } }
}

test('declining consent opens the policy and never stores consent', async () => {
  const test = fixture()
  test.choose(false)
  assert.equal(await test.api.ensureAccountConsent(), false)
  assert.equal(test.storage.size, 0)
  assert.deepEqual(test.routes, ['/pages/privacy/index'])
})

test('sensitive data consent is separate from login, per account, versioned and revocable', async () => {
  const test = fixture()
  await test.api.ensureAccountConsent()
  await test.api.ensureCaseDataConsent('first')
  await test.api.ensureCaseDataConsent('first')
  assert.equal(test.prompts.length, 2)
  await test.api.ensureCaseDataConsent('second')
  assert.equal(test.prompts.length, 3)
  test.api.revokeCaseDataConsent('first')
  await test.api.ensureCaseDataConsent('first')
  assert.equal(test.prompts.length, 4)
  test.storage.set('linkmai.privacy.case-data.first', 'old-version')
  await test.api.ensureCaseDataConsent('first')
  assert.equal(test.prompts.length, 5)
})

test('speech processing requires separate account-specific consent and is cleared when consent is revoked', async () => {
  const test = fixture()
  await test.api.ensureCaseDataConsent('first')
  await test.api.ensureSpeechConsent('first')
  await test.api.ensureSpeechConsent('first')
  assert.equal(test.prompts.length, 2)
  await test.api.ensureSpeechConsent('second')
  assert.equal(test.prompts.length, 3)
  test.api.revokeCaseDataConsent('first')
  await test.api.ensureSpeechConsent('first')
  assert.equal(test.prompts.length, 4)
  test.choose(false)
  assert.equal(await test.api.ensureSpeechConsent('third'), false)
  assert.equal(test.storage.has('linkmai.privacy.speech.third'), false)
})
