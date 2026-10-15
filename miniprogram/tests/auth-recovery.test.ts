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
  const counters = { login: 0, exchange: 0, cleared: 0 }
  let session: () => Promise<unknown> = async () => ({ id: 'user-1' })
  const api = {
    UnauthorizedError,
    getToken: () => token,
    setToken: (value: string) => { token = value },
    clearToken: () => { token = null; counters.cleared++ },
    logout: () => { token = null },
    setUnauthorizedHandler() {},
    getSession: () => session(),
    login: async () => { counters.exchange++; return { token: 'new-token', user: { id: 'user-1' } } },
    getCurrentCase: async () => null,
  }
  const module = { exports: {} as any }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, Error,
    require(id: string) {
      if (id === '../services/api') return api
      if (id === './request-guard') return { CaseRequestGuard }
      if (id === '@tarojs/taro') return { login: async () => { counters.login++; return { code: 'real-code' } }, showToast() {} }
      return requireFromSource(id)
    },
  }, { filename: source })
  return { store: module.exports.useAppStore, counters, setSession: (value: typeof session) => { session = value }, UnauthorizedError, token: () => token }
}

describe('authentication recovery', () => {
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
