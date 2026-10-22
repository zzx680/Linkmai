import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, it } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as paymentUtils from '../src/utils/payment'
import type { CaseEntitlement } from '../src/services/api'

const pagePath = path.resolve(__dirname, '../src/pages/payments/index.tsx')
// Keep ES2020 declarations so a render-time temporal-dead-zone bug cannot be
// hidden by downleveling const to var. Render the actual page with React hooks.
const compiledPage = ts.transpileModule(readFileSync(pagePath, 'utf8'), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText
const pageRequire = createRequire(pagePath)

function renderPage(options: {
  loggedIn?: boolean
  hasCase?: boolean
  status?: CaseEntitlement['status']
  amountCents?: number
  features?: CaseEntitlement['features']
} = {}) {
  const state = {
    isLoggedIn: options.loggedIn ?? true,
    authRetryable: false,
    retryAuth() {},
    currentCase: options.hasCase === false ? null : {
      id: 'case-1',
      title: '测试案件',
      hasReport: true,
      entitlement: {
        status: options.status ?? 'unpaid',
        amountCents: options.amountCents ?? 4990,
        currency: 'CNY',
        features: options.features,
      },
    },
  }
  const journeyPath = path.resolve(__dirname, '../src/components/CaseJourney.tsx')
  const journeyModule = { exports: {} as { default: React.ComponentType } }
  vm.runInNewContext(ts.transpileModule(readFileSync(journeyPath, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module: journeyModule, exports: journeyModule.exports,
    require(id: string) {
      if (id === '@tarojs/components') return { View: 'div', Text: 'span' }
      if (id === '@tarojs/taro') return { switchTab() {}, navigateTo() {} }
      if (id === './Avatar') return { default: () => null, __esModule: true }
      return pageRequire(id)
    },
  }, { filename: journeyPath })
  const mocks: Record<string, unknown> = {
    '../../components/CaseJourney': journeyModule.exports,
    './OrderHistory': { __esModule: true, default: () => React.createElement('section', null, '全部交易记录') },
    '@tarojs/components': { View: 'div', Text: 'span' },
    '@tarojs/taro': { useDidShow() {} },
    '../../services/api': { getCurrentCase: async () => state.currentCase },
    '../../components': { Icon: () => null },
    '../../hooks/useCasePayment': {
      useCasePayment: () => ({
        isPaying: false, confirmation: null,
        handlePayment() {}, reconcilePendingPayment: async () => {},
      }),
    },
    '../../store': { useAppStore: Object.assign(() => state, { getState: () => state }) },
    '../../utils/payment': paymentUtils,
    '../../config/env': { IS_H5: false },
    './index.scss': {},
  }
  const module = { exports: {} as { default: React.ComponentType } }
  vm.runInNewContext(compiledPage, {
    module, exports: module.exports,
    require: (id: string) => {
      if (Object.hasOwn(mocks, id)) return mocks[id]
      if (id === 'react' || id === 'react/jsx-runtime') return pageRequire(id)
      throw new Error(`Unexpected page dependency: ${id}`)
    },
  }, { filename: pagePath })
  return renderToStaticMarkup(React.createElement(module.exports.default))
}

describe('payment page rendering', () => {
  it('renders the login and missing-case states', () => {
    assert.match(renderPage({ loggedIn: false, hasCase: false }), /登录后查看付费权益/)
    assert.match(renderPage({ hasCase: false }), /暂无可查看的付费权益/)
    assert.match(renderPage({ hasCase: false }), /全部交易记录/)
    assert.doesNotMatch(renderPage({ loggedIn: false }), /全部交易记录/)
  })

  it('renders unpaid, pending, paid and refunded actions', () => {
    assert.match(renderPage(), /解锁当前案件 · ¥49.90/)
    assert.match(renderPage({ status: 'pending' }), /刷新支付结果/)
    assert.match(renderPage({ status: 'paid' }), /查看完整方案/)
    const refunded = renderPage({ status: 'refunded' })
    assert.match(refunded, /相关付费权益已失效/)
    assert.doesNotMatch(refunded, /解锁当前案件 ·/)
  })

  it('does not offer payment without a valid price', () => {
    const html = renderPage({ amountCents: 0 })
    assert.match(html, /金额待确认/)
    assert.doesNotMatch(html, /解锁当前案件 ·/)
  })

  it('filters paid benefits using server entitlements', () => {
    const html = renderPage({ status: 'paid', features: {
      fullReport: true, compensationEstimate: false, actionPlan: false,
      documentGeneration: false, rerunAfterMaterialUpdate: true,
    } })
    assert.match(html, /完整事故处理报告/)
    assert.match(html, /补充材料后更新分析/)
    assert.doesNotMatch(html, /赔偿项目与金额估算|分步骤处理方案/)
  })

  it('does not advertise unavailable document generation, even with legacy entitlements', () => {
    assert.doesNotMatch(renderPage(), /相关文书生成/)
    assert.doesNotMatch(renderPage({ status: 'paid', features: {
      fullReport: true, compensationEstimate: true, actionPlan: true,
      documentGeneration: true, rerunAfterMaterialUpdate: true,
    } }), /相关文书生成/)
  })
})
