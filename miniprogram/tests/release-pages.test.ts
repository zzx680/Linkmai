import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as privacyContent from '../src/content/privacy'

function render(page: string, state: Record<string, unknown>) {
  const filename = path.resolve(__dirname, `../src/pages/${page}/index.tsx`)
  const localRequire = createRequire(filename)
  const module = { exports: {} as { default: React.ComponentType } }
  vm.runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText, {
    module, exports: module.exports,
    require(id: string) {
      if (id === '@tarojs/components') return { View: 'div', Text: 'span', Button: 'button', ScrollView: 'section' }
      if (id === '@tarojs/taro') return { useDidShow() {}, useDidHide() {} }
      if (id === '../../services/api' || id === '../../utils/privacy-consent' || id.endsWith('.scss')) return {}
      if (id === '../../store') return { useAppStore: Object.assign(() => state, { getState: () => state }) }
      if (id === '../../content/privacy') return privacyContent
      if (id === '../../components') return { Icon: () => null }
      if (id === '../../components/CaseJourney') return { default: () => null, __esModule: true }
      return localRequire(id)
    }
  })
  return renderToStaticMarkup(React.createElement(module.exports.default))
}

test('privacy explanation and data rights remain readable without login', () => {
  const html = render('privacy', { isLoggedIn: false, isAuthenticating: false })
  assert.match(html, /医疗健康、身份等信息可能属于敏感个人信息/)
  assert.match(html, /退出登录不会删除/)
  assert.match(html, /登录后管理数据/)
  assert.match(html, /郑州跃晖企业管理咨询有限公司/)
  assert.match(html, /hk.charlie@163.com/)
  assert.doesNotMatch(html, /暂无申请记录/)
})

test('paid report shows confirmed source count without offering unavailable exports', () => {
  const html = render('report', {
    currentCase: { id: 'case', entitlement: { status: 'paid' }, title: '案件' },
    currentReport: { generatedAt: '2026-10-19T00:00:00Z', analysis: '分析', recommendations: [] },
    materials: [{ confirmed: true, fields: [] }, { confirmed: false, fields: [] }]
  })
  assert.match(html, /已确认的 1 份材料/)
  assert.doesNotMatch(html, /导出 PDF|导出 Word/)
})
