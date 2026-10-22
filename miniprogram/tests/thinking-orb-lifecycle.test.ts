import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as engine from '../src/components/ThinkingOrb/engine'

const file = path.resolve(__dirname, '../src/components/ThinkingOrb/index.tsx')
const localRequire = createRequire(file)
const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText

function fixture() {
  let effect: () => (() => void) | undefined
  let selection: (result: unknown[]) => void = () => {}
  let requested = 0, cancelled = 0, cleared = 0, transform: number[] = []
  const context = {
    setTransform(...values: number[]) { transform = values }, clearRect() { cleared++ }, beginPath() {}, arc() {}, fill() {}, fillStyle: ''
  }
  const canvas = {
    width: 0, height: 0, getContext: () => context,
    requestAnimationFrame: () => ++requested,
    cancelAnimationFrame: (id: number) => { cancelled = id }
  }
  const query = { select: () => query, fields: () => query, exec: (callback: typeof selection) => { selection = callback } }
  const module = { exports: {} as any }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, setTimeout, clearTimeout,
    require(id: string) {
      if (id === 'react') return {
        useRef: (value: unknown) => ({ current: value }),
        useState: (value: unknown) => [typeof value === 'function' ? value() : value, () => {}],
        useEffect: (callback: typeof effect) => { effect = callback }
      }
      if (id === '@tarojs/components') return { Canvas: 'canvas', Text: 'span', View: 'div' }
      if (id === '@tarojs/taro') return {
        useDidShow() {}, useDidHide() {}, nextTick: (callback: () => void) => callback(),
        createSelectorQuery: () => query, getWindowInfo: () => ({ pixelRatio: 3 })
      }
      if (id === '../../config/env') return { IS_H5: false }
      if (id === './engine') return engine
      if (id.endsWith('.scss')) return {}
      return localRequire(id)
    }
  })
  module.exports.default()
  const cleanup = effect!()!
  return { canvas, cleanup, resolve: () => selection([{ node: canvas }]), stats: () => ({ requested, cancelled, cleared, transform }) }
}

test('native canvas caps pixel density, draws immediately, and cancels the owned frame on unmount', () => {
  const f = fixture()
  f.resolve()
  assert.equal(f.canvas.width, 128)
  assert.equal(f.canvas.height, 128)
  assert.deepEqual(f.stats().transform, [2, 0, 0, 2, 0, 0])
  assert.equal(f.stats().cleared, 1)
  assert.equal(f.stats().requested, 1)
  f.cleanup()
  assert.equal(f.stats().cancelled, 1)
})

test('late selector results cannot start a canvas after the component is removed', () => {
  const f = fixture()
  f.cleanup()
  f.resolve()
  assert.equal(f.stats().requested, 0)
  assert.equal(f.stats().cleared, 0)
})
