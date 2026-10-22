import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SpeechSession, SpeechCancelled, appendDictation, type RecognitionManager, type SpeechCallbacks, type SpeechState } from '../src/services/speech/session'
import { voiceInputConfig } from '../config/voice-input'

function fixture(prepare?: () => Promise<RecognitionManager>) {
  const states: SpeechState[] = [], partials: string[] = [], results: string[] = [], errors: string[] = [], removed: string[] = []
  let starts = 0, stops = 0
  const manager: RecognitionManager = {
    start(options) { assert.deepEqual(options, { duration: 60000, lang: 'zh_CN' }); starts++ },
    stop() { stops++ }
  }
  const callbacks: SpeechCallbacks = { onState: state => states.push(state), onPartial: text => partials.push(text), onResult: text => results.push(text), onError: message => errors.push(message) }
  const session = new SpeechSession(prepare || (async () => manager), path => removed.push(path))
  return { session, manager, callbacks, states, partials, results, errors, removed, starts: () => starts, stops: () => stops }
}

test('speech results preserve draft and do not replace empty/silent recognition', () => {
  assert.equal(appendDictation('已有草稿', '  新的口述  '), '已有草稿\n新的口述')
  assert.equal(appendDictation('已有草稿\n', '新的口述'), '已有草稿\n新的口述')
  assert.equal(appendDictation('', '识别结果'), '识别结果')
  assert.equal(appendDictation('已有草稿', '  '), '已有草稿')
})

test('transcription waits for final text, supports partials, and cleans plugin temporary files', async () => {
  const f = fixture()
  await f.session.start(f.callbacks)
  assert.deepEqual(f.states, ['authorizing'])
  f.manager.onStart!()
  f.manager.onRecognize!({ result: '事故发生在' })
  assert.deepEqual(f.partials, ['事故发生在'])
  assert.deepEqual(f.results, [])
  f.session.stop()
  assert.equal(f.stops(), 1)
  assert.deepEqual(f.states, ['authorizing', 'listening', 'transcribing'])
  f.manager.onStop!({ result: '  事故发生在路口  ', tempFilePath: 'wxfile://tmp/sample.mp3' })
  assert.deepEqual(f.results, ['事故发生在路口'])
  assert.deepEqual(f.removed, ['wxfile://tmp/sample.mp3'])
  assert.equal(f.states.at(-1), 'idle')
})

test('cancel / page hide rejects late results and prevents reusing a manager before stop acknowledgement', async () => {
  const f = fixture()
  await f.session.start(f.callbacks)
  f.manager.onStart!()
  f.session.cancel()
  assert.equal(f.stops(), 1)
  await f.session.start(f.callbacks)
  assert.equal(f.starts(), 1)
  f.manager.onRecognize!({ result: '取消后的迟到文字' })
  f.manager.onStop!({ result: '不得插入其他案件', tempFilePath: 'wxfile://tmp/cancelled.mp3' })
  assert.deepEqual(f.results, [])
  assert.deepEqual(f.partials, [])
  assert.deepEqual(f.removed, ['wxfile://tmp/cancelled.mp3'])
  await f.session.start(f.callbacks)
  assert.equal(f.starts(), 2)
  f.manager.onError!({ retcode: -30005 })
})

test('cancelling during authorization prevents the microphone from starting', async () => {
  let resolve!: (manager: RecognitionManager) => void
  const f = fixture(() => new Promise<RecognitionManager>(done => { resolve = done }))
  const start = f.session.start(f.callbacks)
  f.session.cancel()
  resolve(f.manager)
  await start
  assert.equal(f.starts(), 0)
  assert.deepEqual(f.results, [])
  assert.equal(f.states.at(-1), 'idle')
})

test('cancelling between start request and actual microphone start stops immediately once it starts', async () => {
  const f = fixture()
  await f.session.start(f.callbacks)
  f.session.cancel()
  f.manager.onStart!()
  assert.equal(f.stops(), 1)
  f.manager.onStop!({ result: '丢弃' })
  assert.deepEqual(f.results, [])
  assert.ok(!f.states.includes('listening'))
})

test('declined permission and silent or failed recognition never produce a message', async () => {
  const declined = fixture(async () => { throw new SpeechCancelled() })
  await declined.session.start(declined.callbacks)
  assert.deepEqual(declined.errors, [])
  assert.equal(declined.states.at(-1), 'idle')
  const silent = fixture()
  await silent.session.start(silent.callbacks)
  silent.manager.onStart!()
  silent.manager.onStop!({ result: ' ' })
  assert.match(silent.errors[0], /没有识别到文字/)
  assert.deepEqual(silent.results, [])
  await silent.session.start(silent.callbacks)
  silent.manager.onError!({ retcode: -30008 })
  assert.equal(silent.states.at(-1), 'idle')
})

test('stop timeout quarantines the old manager and permits retry only after a new manager is supplied', async () => {
  const timers: Array<{ callback: () => void; delay: number; cancelled: boolean }> = []
  const clock = {
    setTimeout(callback: () => void, delay: number) {
      timers.push({ callback, delay, cancelled: false })
      return timers.length - 1
    },
    clearTimeout(handle: number | undefined) {
      if (handle !== undefined && timers[handle]) timers[handle].cancelled = true
    },
    run(delay: number) {
      const timer = [...timers].reverse().find(item => item.delay === delay && !item.cancelled)
      assert.ok(timer)
      timer!.cancelled = true
      timer!.callback()
    },
  }
  const results: string[] = [], errors: string[] = []
  const managerOne: RecognitionManager = { start() {}, stop() {} }
  const managerTwo: RecognitionManager = { start() {}, stop() {} }
  const callbacks: SpeechCallbacks = { onState() {}, onPartial() {}, onResult: text => results.push(text), onError: message => errors.push(message) }
  const managers = [managerOne, managerTwo]
  const session = new SpeechSession(async () => managers.shift()!, () => {}, clock)

  await session.start(callbacks)
  managerOne.onStart!()
  const lateStop = managerOne.onStop!
  session.stop()
  clock.run(12000)
  assert.match(errors.at(-1)!, /退出微信小程序后重新进入/)
  lateStop({ result: '旧会话结果' })
  assert.deepEqual(results, [])

  await session.start(callbacks)
  managerTwo.onStart!()
  session.stop()
  managerTwo.onStop!({ result: '新会话结果' })
  assert.deepEqual(results, ['新会话结果'])
})

test('authorized plugin is enabled by default and can be explicitly disabled', () => {
  assert.deepEqual(voiceInputConfig('false'), {})
  const enabled = voiceInputConfig('true')
  assert.deepEqual(voiceInputConfig(''), enabled)
  const previous = process.env.TARO_APP_VOICE_INPUT_ENABLED
  try {
    delete process.env.TARO_APP_VOICE_INPUT_ENABLED
    assert.deepEqual(voiceInputConfig(), enabled)
  } finally {
    if (previous === undefined) delete process.env.TARO_APP_VOICE_INPUT_ENABLED
    else process.env.TARO_APP_VOICE_INPUT_ENABLED = previous
  }
  assert.equal(enabled.plugins?.WechatSI.provider, 'wx069ba97219f66d99')
  assert.ok(enabled.permission?.['scope.record'].desc)
  assert.throws(() => voiceInputConfig('yes'), /true or false/)
})
