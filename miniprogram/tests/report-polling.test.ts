import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const filename = path.resolve(__dirname, '../src/pages/report/index.tsx')
const localRequire = createRequire(filename)
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText

function setup(harness = false) {
  const effects: Array<() => (() => void) | undefined> = []
  const timers = new Map<number, () => Promise<void>>()
  let calls = 0
  let timerId = 0
  const state: any = {
    currentCase: { id: 'case', entitlement: { status: 'paid' } }, materials: [],
    currentReport: null, reportRunId: 'run', isGeneratingReport: true,
    refreshReportRun: async () => { calls++; return true },
  }
  let stateIndex = 0
  const module = { exports: {} as any }
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    setTimeout: (fn: () => Promise<void>) => { timers.set(++timerId, fn); return timerId },
    clearTimeout: (id: number) => timers.delete(id),
    require(id: string) {
      if (id === 'react') return { useState: () => [[ '', harness, true, 0 ][stateIndex++], () => {}], useEffect: (fn: any) => effects.push(fn) }
      if (id === '@tarojs/taro') return { useDidShow() {}, useDidHide() {} }
      if (id === '@tarojs/components') return { View: 'div', Text: 'span', ScrollView: 'section' }
      if (id === '../../store') return { useAppStore: Object.assign(() => state, { getState: () => state, setState: (patch: any) => Object.assign(state, patch) }) }
      if (id === '../../components') return { Icon: () => null }
      if (id === '../../services/workflow') return { workflowApi: { enabled: async () => harness } }
      if (id === '../../components/CaseWorkflow') return {}
      if (id === '../../components/CaseJourney' || id.endsWith('.scss')) return {}
      return localRequire(id)
    },
  })
  module.exports.default()
  return { state, effects, timers, calls: () => calls }
}

test('report polling pauses after sixty queries and retains the task for manual refresh', async () => {
  const fixture = setup()
  const cleanup = fixture.effects[2]()!
  await new Promise(resolve => setImmediate(resolve))
  while (fixture.timers.size) {
    const [id, fn] = fixture.timers.entries().next().value!
    fixture.timers.delete(id)
    await fn()
  }
  assert.equal(fixture.calls(), 60)
  assert.equal(fixture.state.reportRunId, 'run')
  assert.equal(fixture.state.isGeneratingReport, false)
  assert.match(fixture.state.reportRunError, /刷新进度/)
  cleanup()
})

test('leaving the report page cancels pending polling without losing the run', async () => {
  const fixture = setup()
  const cleanup = fixture.effects[2]()!
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fixture.timers.size, 1)
  cleanup()
  assert.equal(fixture.timers.size, 0)
  assert.equal(fixture.state.reportRunId, 'run')
  fixture.effects[2]()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fixture.calls(), 2)
})

test('new workflow owns polling when enabled and never requests a legacy report', async () => {
  const fixture = setup(true)
  fixture.effects[2]()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fixture.calls(), 0)
  assert.equal(fixture.timers.size, 0)
})
