import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as paymentUtils from '../src/utils/payment'

const source = ts.transpileModule(readFileSync(path.resolve(__dirname, '../src/hooks/useCasePayment.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText

function fixture(options: { entitlement?: string; pending?: unknown; orderStatus?: string; error?: string } = {}) {
  const calls: string[] = []
  const toasts: string[] = []
  let stored = options.pending
  const state = {
    user: { id: 'user-1' }, token: 'token', isLoggedIn: true,
    currentCase: { id: 'case-1', entitlement: { status: options.entitlement || 'unpaid', amountCents: 4990, currency: 'CNY' } }
  }
  const module = { exports: {} as any }
  vm.runInNewContext(source, {
    module, exports: module.exports,
    setTimeout: (callback: () => void) => callback(),
    require(id: string) {
      if (id === 'react') return {
        useState: (initial: unknown) => [initial, () => {}],
        useRef: (initial: unknown) => ({ current: initial }),
        useEffect: (callback: () => unknown) => callback()
      }
      if (id === '../store') return {
        useAppStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
          getState: () => state,
          setState: (patch: object) => Object.assign(state, patch),
          subscribe: () => () => {}
        })
      }
      if (id === '../services/api') return {
        createPaymentOrder: async () => { calls.push('create-order'); throw new Error('Recovery must not create an order') },
        getPaymentOrder: async () => {
          calls.push('check-order')
          if (options.error) throw new Error(options.error)
          return { orderId: 'order-1', caseId: 'case-1', status: options.orderStatus || 'paid' }
        },
        getCurrentCase: async () => { calls.push('refresh-case'); return state.currentCase }
      }
      if (id === '@tarojs/taro') return {
        getStorageSync: () => stored,
        removeStorageSync: () => { calls.push('clear-pending'); stored = undefined },
        showToast: ({ title }: { title: string }) => toasts.push(title),
        requestPayment: async () => { calls.push('open-payment') }
      }
      if (id === '../config/env') return { IS_H5: false }
      if (id === '../utils/payment') return paymentUtils
      throw new Error(id)
    }
  })
  return { api: module.exports.useCasePayment(), calls, toasts, pending: () => stored }
}

const pending = { userId: 'user-1', caseId: 'case-1', orderId: 'order-1' }

test('returning to a page without a matching pending payment stays silent', async () => {
  for (const entitlement of ['unpaid', 'pending', 'paid', 'refunded']) {
    for (const stored of [undefined, { ...pending, userId: 'other-user' }, { ...pending, caseId: 'other-case' }]) {
      const f = fixture({ entitlement, pending: stored })
      await f.api.reconcilePendingPayment()
      assert.deepEqual(f.toasts, [])
      assert.deepEqual(f.calls, [])
      assert.equal(f.pending(), stored)
    }
  }
})

test('a matching pending payment still checks the server and announces confirmed results', async () => {
  for (const [orderStatus, expected] of [['paid', '已解锁完整方案'], ['refunded', '订单已退款']]) {
    const f = fixture({ pending, orderStatus })
    await f.api.reconcilePendingPayment()
    assert.deepEqual(f.calls, ['check-order', 'clear-pending', 'refresh-case'])
    assert.deepEqual(f.toasts, [expected])
    assert.equal(f.pending(), undefined)
  }
})

test('a failed payment status check retains the order for retry and reports the error', async () => {
  const f = fixture({ pending, error: '连接超时，请检查网络后重试' })
  await f.api.reconcilePendingPayment()
  assert.deepEqual(f.calls, ['check-order'])
  assert.equal(f.pending(), pending)
  assert.deepEqual(f.toasts, ['连接超时，请检查网络后重试'])
})
