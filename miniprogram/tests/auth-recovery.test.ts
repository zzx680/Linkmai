import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { CaseRequestGuard } from '../src/store/request-guard'

const source = path.resolve(__dirname, '../src/store/index.ts')
const requireFromSource = createRequire(source)
const compiled = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText

function setup(token: string | null = 'saved-token') {
  class UnauthorizedError extends Error {}
  class ApiError extends Error {
    constructor(message: string, public statusCode: number, public code?: string) { super(message) }
  }
  const counters = { login: 0, exchange: 0, cleared: 0, messages: 0 }
  let session: () => Promise<unknown> = async () => ({ id: 'user-1' })
  let currentCase: unknown = null
  let consent = true
  let run: any = null
  let report: any = null
  let queryRun = async () => run
  let history: () => Promise<any> = async () => ({ messages: [] })
  let send: (...args: any[]) => Promise<any> = async () => ({ message: 'reply' })
  const sent: any[][] = []
  const reportCalls = { generate: 0 }
  const api = {
    UnauthorizedError,
    ApiError,
    getToken: () => token,
    setToken: (value: string) => { token = value },
    clearToken: () => { token = null; counters.cleared++ },
    logout: () => { token = null },
    setUnauthorizedHandler() {},
    getSession: () => session(),
    login: async () => { counters.exchange++; return { token: 'new-token', user: { id: 'user-1' } } },
    getCurrentCase: async () => currentCase,
    getLatestReportRun: () => queryRun(),
    getReportRun: () => queryRun(),
    getReport: async () => report,
    generateReport: async () => { reportCalls.generate++; return run },
    getMaterials: async () => [],
    getConversationHistory: () => history(),
    sendMessageStream: async (...args: any[]) => { counters.messages++; sent.push(args); return send(...args) },
  }
  const module = { exports: {} as any }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, Error,
    require(id: string) {
      if (id === '../services/api') return api
      if (id === './request-guard') return { CaseRequestGuard }
      if (id === '../utils/privacy-consent') return { ensureAccountConsent: async () => consent, ensureCaseDataConsent: async () => consent }
      if (id === '@tarojs/taro') return { login: async () => { counters.login++; return { code: 'real-code' } }, showToast() {} }
      return requireFromSource(id)
    },
  }, { filename: source })
  return { store: module.exports.useAppStore, sent, ApiError, setHistory: (value: typeof history) => { history = value }, setSend: (value: typeof send) => { send = value }, reportCalls, setRun: (value: any) => { run = value }, setReport: (value: any) => { report = value }, setRunQuery: (value: typeof queryRun) => { queryRun = value }, counters, setSession: (value: typeof session) => { session = value }, setCurrentCase: (value: unknown) => { currentCase = value }, setConsent: (value: boolean) => { consent = value }, UnauthorizedError, token: () => token }
}

describe('conversation readiness recovery', () => {
  it('shows only one incremental reply and replaces it with the committed result', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case' })
    await test.store.getState().checkLoginStatus()
    let complete!: (value: any) => void
    let started!: () => void
    const start = new Promise<void>(resolve => { started = resolve })
    test.setSend(async (...args) => {
      assert.equal(test.store.getState().messages.length, 1, 'no empty assistant placeholder')
      args[5]('第一段')
      args[5]('第二段')
      return new Promise(done => { complete = done; started() })
    })
    const pending = test.store.getState().sendMessage('hello')
    await start
    assert.equal(test.store.getState().messages.length, 2)
    assert.equal(test.store.getState().messages[1].content, '第一段第二段')
    assert.equal(test.store.getState().messages[1].streaming, true)
    assert.equal(test.store.getState().isAiTyping, true)
    complete({ message: '完整回复' })
    await pending
    assert.equal(test.store.getState().messages.length, 2)
    assert.equal(test.store.getState().messages[1].content, '完整回复')
    assert.equal(test.store.getState().messages[1].streaming, undefined)
    assert.equal(test.store.getState().isAiTyping, false)
  })

  it('removes interrupted partial output and reuses its request ID on retry', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case' })
    await test.store.getState().checkLoginStatus()
    test.setSend(async (...args) => { args[5]('未完成'); throw new test.ApiError('断线', 0) })
    await assert.rejects(test.store.getState().sendMessage('hello'), /断线/)
    assert.equal(test.store.getState().messages.length, 0)
    test.setSend(async () => ({ message: '完整回复' }))
    await test.store.getState().sendMessage('hello')
    assert.equal(test.sent[0][4], test.sent[1][4])
  })

  it('ignores late deltas and completion after switching cases', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case-a' })
    await test.store.getState().checkLoginStatus()
    let delta!: (text: string) => void
    let complete!: (value: any) => void
    let started!: () => void
    const start = new Promise<void>(resolve => { started = resolve })
    test.setSend(async (...args) => { delta = args[5]; return new Promise(done => { complete = done; started() }) })
    const pending = test.store.getState().sendMessage('hello')
    await start
    delta('案件A')
    test.setCurrentCase({ id: 'case-b' })
    await test.store.getState().loadCurrentCase()
    delta('不得串案')
    complete({ message: '旧案件回复' })
    await pending
    assert.equal(test.store.getState().messages.length, 0)
    assert.equal(test.store.getState().currentCase.id, 'case-b')
    assert.equal(test.store.getState().isAiTyping, false)
  })

  it('restores readiness and clears it when switching cases', async () => {
    const test = setup()
    const readiness = { canGenerate: false, confirmed: 2, pending: 1, missing: [{ label: '事故地点' }] }
    test.setCurrentCase({ id: 'case-a' })
    test.setHistory(async () => ({ messages: [], readiness }))
    await test.store.getState().loadCurrentCase()
    assert.equal(test.store.getState().readiness, readiness)
    test.setCurrentCase({ id: 'case-b' })
    test.setHistory(async () => ({ messages: [] }))
    await test.store.getState().loadCurrentCase()
    assert.equal(test.store.getState().readiness, null)
  })

  it('reuses the request ID after a timeout and reconciles replayed messages', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case' })
    await test.store.getState().checkLoginStatus()
    test.setSend(async () => { throw new Error('timeout') })
    await assert.rejects(test.store.getState().sendMessage('hello'), /timeout/)
    const messages = [{ id: 'server-user', role: 'user', content: 'hello' }, { id: 'server-assistant', role: 'assistant', content: 'reply' }]
    test.setHistory(async () => ({ messages, readiness: { canGenerate: true } }))
    test.setSend(async () => ({ message: 'reply', readiness: { canGenerate: true } }))
    await test.store.getState().sendMessage('hello')
    assert.equal(test.sent[0][4], test.sent[1][4])
    assert.equal(test.store.getState().messages.length, 2)
    assert.equal(test.store.getState().messages[0].id, 'server-user')
    assert.equal(test.store.getState().readiness.canGenerate, true)
  })

  it('refreshes stale conversation state and starts a new request after a conflict', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case' })
    await test.store.getState().checkLoginStatus()
    test.setHistory(async () => ({ messages: [], readiness: { canGenerate: false } }))
    test.setSend(async () => { throw new test.ApiError('stale', 409, 'CONVERSATION_STALE') })
    await assert.rejects(test.store.getState().sendMessage('hello'), /stale/)
    assert.equal(test.store.getState().readiness.canGenerate, false)
    test.setSend(async () => ({ message: 'reply' }))
    await test.store.getState().sendMessage('hello')
    assert.notEqual(test.sent[0][4], test.sent[1][4])
    assert.equal(test.store.getState().isAiTyping, false)
  })
})

describe('report run recovery', () => {
  it('restores a server run into a fresh store without generating again', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case', hasReport: false })
    test.setRun({ runId: 'run', status: 'running' })
    await test.store.getState().checkLoginStatus()
    assert.equal(test.store.getState().reportRunId, 'run')
    assert.equal(test.store.getState().isGeneratingReport, true)
    await test.store.getState().generateReport()
    assert.equal(test.reportCalls.generate, 0)
    test.setRun({ runId: 'run', status: 'succeeded' })
    test.setReport({ caseId: 'case', analysis: 'finished' })
    await test.store.getState().refreshReportRun()
    assert.equal(test.store.getState().currentReport.analysis, 'finished')
    assert.equal(test.store.getState().currentCase.hasReport, true)
    assert.equal(test.store.getState().isGeneratingReport, false)
    assert.equal(test.store.getState().reportRunId, null)
  })

  it('keeps a run refreshable across network errors and terminal failure', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case', hasReport: false })
    test.setRun({ runId: 'run', status: 'queued' })
    await test.store.getState().loadCurrentCase()
    test.setRunQuery(async () => { throw new Error('offline') })
    await assert.rejects(test.store.getState().refreshReportRun(), /offline/)
    assert.equal(test.store.getState().reportRunId, 'run')
    assert.equal(test.store.getState().isGeneratingReport, false)
    test.setRunQuery(async () => ({ runId: 'run', status: 'failed', safeErrorCode: 'PAYMENT_REQUIRED' }))
    assert.equal(await test.store.getState().refreshReportRun(), false)
    assert.match(test.store.getState().reportRunError, /权益/)
    assert.equal(test.reportCalls.generate, 0)
  })

  it('discards a delayed run response after logout and return to the same case', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case', hasReport: false })
    await test.store.getState().loadCurrentCase()
    let resolve!: (value: any) => void
    test.setRunQuery(() => new Promise(done => { resolve = done }))
    const pending = test.store.getState().refreshReportRun()
    test.store.getState().logout()
    test.setRunQuery(async () => ({ runId: 'new-run', status: 'queued' }))
    await test.store.getState().loadCurrentCase()
    resolve({ runId: 'old-run', status: 'running' })
    await pending
    assert.equal(test.store.getState().reportRunId, 'new-run')
  })

  it('retries reading a succeeded run when its report is not available yet', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case', hasReport: false })
    test.setRun({ runId: 'run', status: 'running' })
    await test.store.getState().loadCurrentCase()
    test.setRun({ runId: 'run', status: 'succeeded' })
    await assert.rejects(test.store.getState().refreshReportRun(), /报告暂不可用/)
    assert.equal(test.store.getState().reportRunId, 'run')
    test.setReport({ caseId: 'case', analysis: 'ready' })
    await test.store.getState().refreshReportRun()
    assert.equal(test.store.getState().currentReport.analysis, 'ready')
  })
})

describe('authentication recovery', () => {
  it('does not contact WeChat or create an account when the login notice is declined', async () => {
    const test = setup(null)
    test.setConsent(false)
    assert.equal(await test.store.getState().retryAuth(), false)
    assert.equal(test.counters.login, 0)
    assert.equal(test.counters.exchange, 0)
    assert.equal(test.token(), null)
    assert.equal(test.store.getState().isAuthenticating, false)
  })

  it('clears a cached report when refreshed case metadata says materials invalidated it', async () => {
    const test = setup()
    test.store.setState({ currentCase: { id: 'case', hasReport: true }, currentReport: { analysis: 'stale' } })
    test.setCurrentCase({ id: 'case', hasReport: false })
    await test.store.getState().loadCurrentCase()
    assert.equal(test.store.getState().currentReport, null)
  })

  it('declining sensitive data processing never sends content and releases the send lock', async () => {
    const test = setup()
    test.setCurrentCase({ id: 'case', hasReport: false })
    await test.store.getState().checkLoginStatus()
    test.setConsent(false)
    await assert.rejects(test.store.getState().sendMessage('private'), /尚未同意案件资料处理/)
    await assert.rejects(test.store.getState().sendMessage('retry private'), /尚未同意案件资料处理/)
    assert.equal(test.counters.messages, 0)
    assert.equal(test.store.getState().messages.length, 0)
    assert.equal(test.store.getState().isAiTyping, false)
  })
  it('preserves credentials on a temporary service failure and exposes the cause', async () => {
    const test = setup()
    test.setSession(async () => { throw new Error('服务暂不可用') })
    assert.equal(await test.store.getState().checkLoginStatus(), false)
    assert.equal(test.token(), 'saved-token')
    assert.equal(test.counters.login, 0)
    assert.equal(test.store.getState().authError, '服务暂不可用')
    assert.equal(test.store.getState().isAuthenticating, false)
  })

  it('deduplicates concurrent restoration and retries after an expired session', async () => {
    const test = setup()
    test.setSession(async () => { throw new test.UnauthorizedError('expired') })
    const first = test.store.getState().checkLoginStatus()
    const second = test.store.getState().checkLoginStatus()
    assert.equal(first, second)
    assert.equal(await first, true)
    assert.equal(test.counters.login, 1)
    assert.equal(test.counters.exchange, 1)
    assert.equal(test.token(), 'new-token')
  })

  it('does not restore an account after logout while session validation is pending', async () => {
    const test = setup()
    let resolve!: (value: unknown) => void
    test.setSession(() => new Promise(done => { resolve = done }))
    const pending = test.store.getState().checkLoginStatus()
    test.store.getState().logout()
    resolve({ id: 'user-1' })
    assert.equal(await pending, false)
    assert.equal(test.store.getState().isLoggedIn, false)
    assert.equal(test.token(), null)
  })
})
