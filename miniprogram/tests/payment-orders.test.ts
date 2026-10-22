import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

function compile(file: string) {
  return ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText
}

function fixture() {
  const values: any[] = []
  const effects: { deps: unknown[]; cleanup?: () => void }[] = []
  const pendingEffects: (() => void)[] = []
  const requests: { offset: number; resolve: (result: any) => void; reject: (error: Error) => void }[] = []
  const statusRequests: { orderId: string; resolve: (result: any) => void; reject: (error: Error) => void }[] = []
  const session = { isLoggedIn: true, token: 'owner-a' }
  let index = 0
  let onShow = () => {}
  const module = { exports: {} as any }
  vm.runInNewContext(compile(path.resolve(__dirname, '../src/hooks/usePaymentOrders.ts')), {
    module, exports: module.exports, Error,
    require(id: string) {
      if (id === 'react') return {
        useState(initial: unknown) {
          const slot = index++
          if (!(slot in values)) values[slot] = initial
          return [values[slot], (next: unknown) => { values[slot] = next }]
        },
        useRef(initial: unknown) {
          const slot = index++
          if (!(slot in values)) values[slot] = { current: initial }
          return values[slot]
        },
        useEffect(callback: () => (() => void), deps: unknown[]) {
          const slot = index++
          if (!effects[slot] || deps.some((value, n) => value !== effects[slot].deps[n])) {
            const old = effects[slot]
            pendingEffects.push(() => { old?.cleanup?.(); effects[slot] = { deps, cleanup: callback() } })
          }
        },
      }
      if (id === '@tarojs/taro') return { useDidShow(callback: () => void) { onShow = callback } }
      if (id === '../store') return { useAppStore: Object.assign(() => session, { getState: () => session }) }
      if (id === '../services/api') return {
        listPaymentOrders: (offset: number) => new Promise((resolve, reject) => requests.push({ offset, resolve, reject })),
        getPaymentOrder: (orderId: string) => new Promise((resolve, reject) => statusRequests.push({ orderId, resolve, reject })),
      }
      throw new Error(id)
    },
  })
  const render = () => { index = 0; return module.exports.usePaymentOrders() }
  return { session, requests, statusRequests, render, effect: () => { while (pendingEffects.length) pendingEffects.shift()!() }, show: () => onShow() }
}

const record = (id: string) => ({ orderId: id, orderNo: id, caseId: 'archived-case', status: 'paid', amountCents: 4990, currency: 'CNY', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z' })

test('order pagination appends records, permits retry, and never creates an order or payment', async () => {
  const f = fixture()
  f.render(); f.effect()
  assert.equal(f.requests.length, 1)
  f.show()
  assert.equal(f.requests.length, 1)
  f.requests[0].resolve({ orders: [record('one')], hasMore: true, nextOffset: 1 })
  await new Promise<void>(resolve => setImmediate(resolve))
  let page = f.render()
  const more = page.loadMore()
  assert.equal(f.requests[1].offset, 1)
  f.requests[1].reject(new Error('网络超时'))
  await more
  page = f.render()
  assert.equal(page.orders.length, 1)
  assert.equal(page.error, '网络超时')
  const retry = page.retry()
  assert.equal(f.requests[2].offset, 1)
  f.requests[2].resolve({ orders: [record('one'), record('two')], hasMore: false, nextOffset: 3 })
  await retry
  page = f.render()
  assert.equal(page.orders.map((order: any) => order.orderId).join(','), 'one,two')
  assert.equal(page.hasMore, false)
  await page.loadMore()
  assert.equal(f.requests.length, 3)
})

test('switching accounts hides old orders immediately and ignores late results from the former session', async () => {
  const f = fixture()
  f.render(); f.effect()
  f.requests[0].resolve({ orders: [record('private-a')], hasMore: false, nextOffset: 1 })
  await new Promise<void>(resolve => setImmediate(resolve))
  let page = f.render()
  assert.equal(page.orders.length, 1)
  const oldRefresh = page.refresh()
  f.session.token = 'owner-b'
  page = f.render()
  assert.equal(page.orders.length, 0)
  f.effect()
  f.requests[1].resolve({ orders: [record('late-private-a')], hasMore: false, nextOffset: 1 })
  await oldRefresh
  assert.equal(f.render().orders.length, 0)
  f.requests[2].resolve({ orders: [record('private-b')], hasMore: false, nextOffset: 1 })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(f.render().orders[0].orderId, 'private-b')
  f.session.isLoggedIn = false
  assert.equal(f.render().orders.length, 0)
})

test('an old backend missing the history endpoint is shown as unavailable, never as an empty order list', async () => {
  const f = fixture()
  f.render(); f.effect()
  f.requests[0].reject(Object.assign(new Error('接口不存在'), { statusCode: 404 }))
  await new Promise<void>(resolve => setImmediate(resolve))
  const page = f.render()
  assert.match(page.error, /订单查询服务暂不可用/)
  assert.notEqual(page.error, '接口不存在')
  const retry = page.retry()
  f.requests[1].resolve({ orders: [record('paid-order')], hasMore: false, nextOffset: 1 })
  await retry
  assert.equal(f.render().error, '')
  assert.equal(f.render().orders[0].orderId, 'paid-order')
})

test('refreshing one order reconciles only that row and ignores duplicate clicks', async () => {
  const f = fixture()
  f.render(); f.effect()
  f.requests[0].resolve({ orders: [record('one'), record('two')], hasMore: false, nextOffset: 2 })
  await new Promise<void>(resolve => setImmediate(resolve))
  let page = f.render()
  const refresh = page.refreshStatus('one')
  await page.refreshStatus('two')
  assert.deepEqual(f.statusRequests.map(request => request.orderId), ['one'])
  f.statusRequests[0].resolve({ orderId: 'one', orderNo: 'one', caseId: 'archived-case', status: 'closed', amountCents: 4990, currency: 'CNY', paidAt: null })
  await refresh
  page = f.render()
  assert.equal(page.orders.find((order: any) => order.orderId === 'one').status, 'closed')
  assert.equal(page.orders.find((order: any) => order.orderId === 'two').status, 'paid')
  assert.equal(page.refreshingOrderId, null)
})

test('a failed single-order refresh reports an error and a late result after account switch is ignored', async () => {
  const f = fixture()
  f.render(); f.effect()
  f.requests[0].resolve({ orders: [record('one')], hasMore: false, nextOffset: 1 })
  await new Promise<void>(resolve => setImmediate(resolve))
  let page = f.render()
  const failed = page.refreshStatus('one')
  f.statusRequests[0].reject(new Error('对账服务暂不可用'))
  await failed
  assert.match(f.render().error, /对账服务暂不可用/)
  const late = f.render().refreshStatus('one')
  f.session.token = 'owner-b'
  f.render(); f.effect()
  f.statusRequests[1]?.resolve({ orderId: 'one', status: 'paid' })
  await late
  assert.equal(f.render().orders.length, 0)
})

test('the actual history component displays every status, order numbers, amounts and retry controls', () => {
  const file = path.resolve(__dirname, '../src/pages/payments/OrderHistory.tsx')
  const nativeRequire = createRequire(file)
  const module = { exports: {} as any }
  vm.runInNewContext(compile(file), {
    module, exports: module.exports,
    require(id: string) {
      if (id === '@tarojs/components') return { View: 'div', Text: ({ selectable, ...props }: any) => React.createElement('span', props), Button: 'button' }
      if (id === '../../hooks/usePaymentOrders') return {}
      if (id === '../../content/privacy') return { privacyOperator: { email: 'support@example.com' } }
      return nativeRequire(id)
    },
  })
  const props = { orders: ['created', 'pending', 'paid', 'failed', 'closed', 'refunded'].map((status, n) => ({ ...record(`order-${n}`), status })), loading: false, error: '', hasMore: true, refresh() {}, loadMore() {}, retry() {}, refreshStatus() {}, refreshingOrderId: null }
  const html = renderToStaticMarkup(React.createElement(module.exports.OrderHistoryContent, props))
  for (const text of ['全部交易记录', '待支付', '待确认', '已支付', '支付失败', '已关闭', '已退款', '¥49.90', '订单详情', '加载更多订单', 'order-5']) assert.ok(html.includes(text))
  assert.match(readFileSync(file, 'utf8'), /刷新支付状态/)
  const empty = renderToStaticMarkup(React.createElement(module.exports.OrderHistoryContent, { ...props, orders: [], error: '连接超时' }))
  assert.match(empty, /连接超时/)
  assert.match(empty, /重新加载/)
  assert.doesNotMatch(empty, /暂无订单记录/)
})
