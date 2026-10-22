import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as state from '../src/components/OnboardingGuide/state'
import { createGuideProgressStore } from '../src/components/OnboardingGuide/progress-store'

const file = path.resolve(__dirname, '../src/components/OnboardingGuide/index.tsx')
const localRequire = createRequire(file)
const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText

function fixture() {
  const store = createGuideProgressStore(() => undefined, () => {})
  const effects: Array<() => (() => void) | undefined> = []
  const timers = new Map<number, () => void>()
  let timerId = 0
  let hide = () => {}
  let selection: (results: unknown[]) => void = () => {}
  const query = { select: () => query, boundingClientRect: () => query, selectViewport: () => query, scrollOffset: () => query, exec: (cb: typeof selection) => { selection = cb } }
  const module = { exports: {} as any }
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    setTimeout(cb: () => void) { timers.set(++timerId, cb); return timerId },
    clearTimeout(id: number) { timers.delete(id) },
    require(id: string) {
      if (id === 'react') return {
        useState: (value: unknown) => [typeof value === 'function' ? value() : value, () => {}],
        useRef: (value: unknown) => ({ current: value }),
        useEffect: (cb: typeof effects[number]) => effects.push(cb),
      }
      if (id === '@tarojs/taro') return {
        useDidShow() {}, useDidHide(cb: () => void) { hide = cb },
        onWindowResize() {}, offWindowResize() {},
        nextTick(cb: () => void) { cb() },
        getWindowInfo: () => ({ windowWidth: 390, windowHeight: 744 }),
        createSelectorQuery: () => query,
      }
      if (id === '@tarojs/components') return {}
      if (id === './state') return state
      if (id === './progress') return {
        getGuideProgress: store.get, completeGuideSteps: store.complete,
        skipGuide: store.skip, subscribeGuideProgress: store.subscribe,
      }
      if (/\.(scss|png)$/.test(id)) return {}
      return localRequire(id)
    },
  })
  module.exports.default({ steps: [{ id: 'describe', target: 'describe' }] })
  const cleanups = effects.map(effect => effect())
  return {
    store, hide: () => hide(),
    measure() {
      const queued = [...timers.values()]; timers.clear()
      queued.forEach(callback => callback())
    },
    resolve(rect: unknown = { left: 24, top: 400, width: 120, height: 40 }) { selection([rect, { scrollTop: 0 }]) },
    unmount() { cleanups.forEach(cleanup => cleanup?.()) },
  }
}

test('leaving a displayed guide consumes the step, preventing replay on tab return', () => {
  const f = fixture()
  f.measure(); f.resolve(); f.hide()
  assert.deepEqual(f.store.get().seen, ['describe'])
  f.unmount()
  assert.deepEqual(f.store.get().seen, ['describe'])
})

test('unmount consumes a displayed guide but not an unrendered or missing target', () => {
  const displayed = fixture()
  displayed.measure(); displayed.resolve(); displayed.unmount()
  assert.deepEqual(displayed.store.get().seen, ['describe'])
  const missing = fixture()
  missing.measure(); missing.resolve(null); missing.hide(); missing.unmount()
  assert.deepEqual(missing.store.get().seen, [])
})

test('late measurement cannot consume an unseen step after unmount', () => {
  const f = fixture()
  f.measure(); f.unmount(); f.resolve(); f.hide()
  assert.deepEqual(f.store.get().seen, [])
})
