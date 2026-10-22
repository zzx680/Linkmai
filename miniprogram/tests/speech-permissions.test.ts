import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import * as speech from '../src/services/speech/session'

function fixture(options: { enabled?: boolean; h5?: boolean; consent?: boolean; privacy?: boolean; microphone?: boolean; previouslyDenied?: boolean; manager?: boolean; cancelled?: boolean } = {}) {
  const calls: string[] = []
  const manager = { start() {}, stop() {} }
  const module = { exports: {} as any }
  const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '../src/services/speech/wechat.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(id: string) {
      if (id === './session') return speech
      if (id === '../../config/env') return { IS_H5: options.h5 === true, VOICE_INPUT_ENABLED: options.enabled !== false }
      if (id === '../../utils/privacy-consent') return { ensureSpeechConsent: async () => { calls.push('consent'); return options.consent !== false } }
      if (id === '@tarojs/taro') return {
        requirePrivacyAuthorize: ({ success, fail }: any) => { calls.push('privacy'); options.privacy === false ? fail() : success() },
        getSetting: async () => { calls.push('settings'); return { authSetting: { 'scope.record': options.previouslyDenied ? false : undefined } } },
        authorize: async () => { calls.push('authorize'); if (options.microphone === false) throw new Error('declined') },
        showModal: async () => { calls.push('modal'); return { confirm: true } },
        openSetting: async () => { calls.push('open-settings'); return { authSetting: { 'scope.record': options.microphone !== false } } },
        requirePlugin: () => { calls.push('plugin'); if (options.manager === false) throw new Error('not available'); return { getRecordRecognitionManager: () => manager } }
      }
      throw new Error(id)
    }
  })
  return { api: module.exports, calls, manager }
}

test('unconfigured or H5 builds do not request microphone access or load plugins', async () => {
  for (const options of [{ enabled: false }, { h5: true }]) {
    const f = fixture(options)
    await assert.rejects(f.api.prepareSpeechInput('user'), /口述输入暂不可用|微信小程序/)
    assert.deepEqual(f.calls, [])
  }
})

test('speech consent and platform privacy approval precede microphone and plugin use', async () => {
  const f = fixture()
  assert.equal(await f.api.prepareSpeechInput('user'), f.manager)
  assert.deepEqual(f.calls, ['consent', 'privacy', 'settings', 'authorize', 'plugin'])
})

test('refusing speech or privacy consent never reaches the microphone', async () => {
  for (const options of [{ consent: false }, { privacy: false }]) {
    const f = fixture(options)
    await assert.rejects(f.api.prepareSpeechInput('user'), speech.SpeechCancelled)
    assert.ok(!f.calls.includes('authorize'))
    assert.ok(!f.calls.includes('plugin'))
  }
})

test('denied microphone and cancelled page startup never load the plugin', async () => {
  const denied = fixture({ microphone: false })
  await assert.rejects(denied.api.prepareSpeechInput('user'), speech.SpeechCancelled)
  assert.ok(!denied.calls.includes('plugin'))
  const cancelled = fixture()
  await assert.rejects(cancelled.api.prepareSpeechInput('user', () => true), speech.SpeechCancelled)
  assert.deepEqual(cancelled.calls, ['consent'])
})

test('previously denied microphone opens settings, and a missing plugin returns a controlled error', async () => {
  const f = fixture({ previouslyDenied: true })
  await f.api.prepareSpeechInput('user')
  assert.ok(f.calls.includes('open-settings'))
  assert.ok(!f.calls.includes('authorize'))
  const missing = fixture({ manager: false })
  await assert.rejects(missing.api.prepareSpeechInput('user'), /口述输入暂不可用/)
})
