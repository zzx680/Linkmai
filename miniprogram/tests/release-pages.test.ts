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

function loadComponent(filename: string, state: Record<string, unknown>) {
  const localRequire = createRequire(filename)
  const module = { exports: {} as { default: React.ComponentType } }
  vm.runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText, {
    module, exports: module.exports,
    require(id: string) {
      if (id === 'react' && filename.endsWith('/components/CaseWorkflow/index.tsx')) return { ...React, useState: (initial: unknown) => [initial === null ? state.workspace : initial, () => {}] }
      if (id === '@tarojs/components') return { View: 'div', Text: 'span', Button: 'button', ScrollView: 'section', Picker: ({ children }: { children: React.ReactNode }) => children, Input: 'input' }
      if (id === '@tarojs/taro') return { useDidShow() {}, useDidHide() {} }
      if (id === '../../services/api' || id === '../../utils/privacy-consent' || id.endsWith('.scss')) return {}
      if (id === '../../hooks/useReportNotification') return { useReportNotification: () => ({ enabled: false, subscriptionId: '', isSubscribing: false, subscribe: async () => false, clearSubscription() {} }) }
      if (id === '../../store') return { useAppStore: Object.assign(() => state, { getState: () => state }) }
      if (id === '../../content/privacy') return privacyContent
      if (id === '../../components') return { Icon: () => null }
      if (id === '../../components/OnboardingGuide/progress') return { restartGuide() {} }
      if (id === '../../services/workflow') return { workflowApi: { enabled: async () => false } }
      if (id === '../../components/CaseWorkflow') return { default: () => null, __esModule: true }
      if (id === '../../components/CaseJourney') return { default: () => null, __esModule: true }
      if (id.endsWith('/AiGeneratedNotice')) return { default: loadComponent(path.resolve(path.dirname(filename), id, 'index.tsx'), state), __esModule: true }
      return localRequire(id)
    }
  })
  return module.exports.default
}

function render(page: string, state: Record<string, unknown>) {
  return renderToStaticMarkup(React.createElement(loadComponent(path.resolve(__dirname, `../src/pages/${page}/index.tsx`), state)))
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
  assert.match(html, /AI生成/)
  assert.match(html, /重要信息请核对原始材料/)
  assert.ok(html.indexOf('AI生成') < html.indexOf('事故分析'))
  assert.doesNotMatch(html, /导出 PDF|导出 Word/)
})

test('help page exposes the native WeChat customer service entry', () => {
  const source = readFileSync(path.resolve(__dirname, '../src/pages/help/index.tsx'), 'utf8')
  assert.match(source, /联系客服/)
  assert.match(source, /联系微信客服/)
  assert.match(source, /openType="contact"/)
})

test('each generated workflow document retains its AI notice through human review', () => {
  const statuses = ['draft', 'user_confirmed', 'lawyer_review', 'approved']
  const types = ['case_report', 'evidence_catalog', 'action_plan']
  for (const status of statuses) {
    const workspace = {
      revision: 1, contextHash: 'current', evidence: [], calculations: [], facts: [], conflicts: [], runs: [], reviews: [], legalReferences: [],
      documents: types.map(type => ({ id: type, type, status, version: 1, sections: [{ title: '内容', paragraphs: ['生成的内容'] }] })),
    }
    const Component = loadComponent(path.resolve(__dirname, '../src/components/CaseWorkflow/index.tsx'), { workspace })
    const html = renderToStaticMarkup(React.createElement(Component, { caseId: 'case' } as any))
    assert.equal((html.match(/class="ai-generated-notice-title"/g) || []).length, 3, status)
    for (const title of ['事故分析报告', '证据目录', '材料补充清单与行动计划']) assert.ok(html.includes(title))
  }
})
