import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import ts from 'typescript'
import sharp from 'sharp'
import type { Case, Material } from '../src/services/api'
import { getCaseNextStep, getHomeMode, getHomeStepDetail, getJourneyStep } from '../src/pages/case/home-state'

const casePageSource = readFileSync(path.resolve(__dirname, '../src/pages/case/index.tsx'), 'utf8')
const caseStylesSource = readFileSync(path.resolve(__dirname, '../src/pages/case/index.scss'), 'utf8')
const journeySource = readFileSync(path.resolve(__dirname, '../src/components/CaseJourney.tsx'), 'utf8')
const casePageConfigSource = readFileSync(path.resolve(__dirname, '../src/pages/case/index.config.ts'), 'utf8')
const shareCoverPath = path.resolve(__dirname, '../src/assets/share/home-card.png')

function clickHomePrimaryAction(currentCase: Case, target = 'primary') {
  const pagePath = path.resolve(__dirname, '../src/pages/case/index.tsx')
  const localRequire = createRequire(pagePath)
  const navigations: string[] = []
  const state = {
    user: { nickname: '测试用户' }, isLoggedIn: true,
    currentCase, materials: [], conversationState: 'collecting',
  }
  const mocks: Record<string, unknown> = {
    react: { useMemo: (factory: () => unknown) => factory(), useState: (initial: unknown) => [initial, () => {}] },
    '@tarojs/components': { View: 'div', Text: 'span', Button: 'button' },
    '@tarojs/taro': {
      useDidShow() {}, useShareAppMessage() {},
      navigateTo: ({ url }: { url: string }) => navigations.push(url),
      switchTab: ({ url }: { url: string }) => navigations.push(url),
    },
    '../../store': { useAppStore: () => state },
    '../../hooks/useCasePayment': { useCasePayment: () => ({ isPaying: false }) },
    '../../components': { Icon: () => null },
    '../../components/CaseJourney': { __esModule: true, default: () => null },
    '../../components/OnboardingGuide': { __esModule: true, default: () => null },
    '../../components/OnboardingGuide/progress': {},
    '../../custom-tab-bar/navigation': {},
    '../../config/env': { IS_H5: false },
  }
  const module = { exports: {} as { default: () => React.ReactElement } }
  vm.runInNewContext(ts.transpileModule(casePageSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module, exports: module.exports,
    require(id: string) {
      if (Object.hasOwn(mocks, id)) return mocks[id]
      if (/\.(scss|png)$/.test(id)) return {}
      return localRequire(id)
    },
  }, { filename: pagePath })
  function findPrimary(node: React.ReactNode): React.ReactElement<any> | undefined {
    if (!React.isValidElement<any>(node)) return
    if (target === 'primary' ? node.props.id === 'guide-create-case' : node.props.className === 'summary-item summary-plan') return node
    return React.Children.toArray(node.props.children).map(findPrimary).find(Boolean)
  }
  const button = findPrimary(module.exports.default())
  assert.ok(button, 'home primary action must be rendered')
  button.props.onClick()
  return navigations
}

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    userId: 'user-1',
    title: '测试交通事故',
    status: 'collecting',
    statusLabel: '收集信息',
    materialCount: 0,
    hasReport: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    entitlement: { status: 'unpaid', amountCents: 4990, currency: 'CNY' },
    ...overrides,
  }
}

function makeMaterial(confirmed = false): Material {
  return {
    id: 'material-1',
    caseId: 'case-1',
    type: 'accident_report',
    imageUrl: 'https://example.com/material.jpg',
    fields: [],
    status: 'processed',
    confirmed,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('home workbench state', () => {
  it('shares only the fixed public entry with the branded card', async () => {
    assert.match(casePageConfigSource, /enableShareAppMessage:\s*true/)
    assert.doesNotMatch(casePageConfigSource, /enableShareTimeline/)
    assert.match(casePageSource, /useShareAppMessage\(\(\) => \(\{[\s\S]*title: '灵迈交通事故处理agent'[\s\S]*path: '\/pages\/case\/index'[\s\S]*imageUrl: shareCover/)
    assert.doesNotMatch(casePageSource, /useShareTimeline|shareTimeline/)

    const shareBlock = casePageSource.slice(casePageSource.indexOf('  useShareAppMessage'), casePageSource.indexOf('  const {'))
    assert.doesNotMatch(shareBlock, /caseId|currentCase|user\??\.|materials|entitlement|payment/)

    const cover = await sharp(shareCoverPath).metadata()
    assert.deepEqual([cover.width, cover.height], [1000, 800])
  })

  it('distinguishes loading, login, empty and failed case states', () => {
    assert.equal(getHomeMode({ isLoggedIn: true, isLoadingCase: true, caseLoadError: null, currentCase: null }), 'loading')
    assert.equal(getHomeMode({ isLoggedIn: false, isLoadingCase: false, caseLoadError: null, currentCase: null }), 'logged_out')
    assert.equal(getHomeMode({ isLoggedIn: true, isLoadingCase: false, caseLoadError: null, currentCase: null }), 'empty')
    assert.equal(getHomeMode({ isLoggedIn: true, isLoadingCase: false, caseLoadError: 'network', currentCase: makeCase() }), 'load_error')
    assert.equal(getHomeMode({ isLoggedIn: true, isLoadingCase: false, caseLoadError: null, currentCase: makeCase() }), 'case')
  })

  it('places the signed-in identity inside the journey card after the welcome', () => {
    const welcomeIndex = casePageSource.indexOf('home-welcome')
    const journeyIndex = casePageSource.indexOf('<CaseJourney active={getJourneyStep(nextStep)}')

    assert.ok(welcomeIndex >= 0)
    assert.ok(journeyIndex > welcomeIndex)
    assert.match(casePageSource, /identityLabel=\{`\$\{nickname\}的案件工作台`\} identityAvatar=\{user\?\.avatar\}/)
    assert.match(caseStylesSource, /\.journey-identity[\s\S]*border-bottom: 1rpx solid #E5E5EA;/)
    assert.match(casePageSource, /Hello👋/)
    assert.match(casePageSource, /欢迎使用灵迈/)
    assert.doesNotMatch(casePageSource, /从一份材料开始整理案件/)
  })

  it('keeps the current journey step visually identifiable', () => {
    assert.match(caseStylesSource, /\.case-page \.journey-step\.current \{[\s\S]*border-color: \$color-brand-primary;[\s\S]*color: \$color-brand-primary;/)
  })

  it('uses one state-aligned journey on signed-in and login pages', () => {
    assert.equal((casePageSource.match(/<CaseJourney/g) || []).length, 2)
    assert.match(casePageSource, /<CaseJourney active=\{0\} compact[\s\S]*actionId="guide-login"[\s\S]*onAction=\{handlePrimaryAction\}/)
    assert.match(casePageSource, /<CaseJourney active=\{getJourneyStep\(nextStep\)\} compact[^>]*actionLabel="开始处理"/)
    assert.match(casePageSource, /identityLabel="登录后使用案件工作台"/)
    assert.match(journeySource, /journey-node"><Text>\{index < currentStep \? '✓' : index \+ 1\}<\/Text>/)
    assert.doesNotMatch(journeySource, /padStart\(/)
    assert.equal(getJourneyStep('continue_materials'), 0)
    assert.equal(getJourneyStep('confirm_materials'), 1)
    assert.equal(getJourneyStep('view_processing'), 2)
    assert.equal(getJourneyStep('unlock_full_plan'), 2)
    assert.equal(getJourneyStep('continue_case'), 2)
    assert.equal(getJourneyStep('view_report'), 3)
  })

  it('maps collection and confirmation stages to material actions', () => {
    assert.equal(getCaseNextStep({ currentCase: makeCase(), materials: [], conversationState: 'collecting' }), 'continue_materials')
    assert.equal(getCaseNextStep({ currentCase: makeCase({ nextAction: 'confirm_materials' }), materials: [makeMaterial()], conversationState: 'collecting' }), 'confirm_materials')
    assert.equal(getCaseNextStep({ currentCase: makeCase(), materials: [makeMaterial()], conversationState: 'confirming' }), 'confirm_materials')
  })

  it('opens the current case materials from continue-upload and confirmation actions', () => {
    assert.deepEqual(clickHomePrimaryAction(makeCase()), ['/pages/materials/index?caseId=case-1'])
    assert.deepEqual(clickHomePrimaryAction(makeCase({ id: 'case-2', nextAction: 'continue_materials' })), ['/pages/materials/index?caseId=case-2'])
    assert.deepEqual(clickHomePrimaryAction(makeCase({ nextAction: 'confirm_materials' })), ['/pages/materials/index?caseId=case-1'])
    assert.deepEqual(clickHomePrimaryAction(makeCase({ entitlement: { status: 'refunded', amountCents: 4990, currency: 'CNY' } })), ['/pages/payments/index'])
  })

  it('does not offer payment while the case is processing', () => {
    assert.equal(getCaseNextStep({ currentCase: makeCase({ status: 'processing', nextAction: 'unlock_full_plan' }), materials: [makeMaterial(true)], conversationState: 'ready' }), 'view_processing')
    assert.equal(getCaseNextStep({ currentCase: makeCase(), materials: [makeMaterial(true)], conversationState: 'analyzing' }), 'view_processing')
  })

  it('maps payment, paid and report states to their single safe actions', () => {
    assert.equal(getCaseNextStep({ currentCase: makeCase({ nextAction: 'unlock_full_plan' }), materials: [makeMaterial(true)], conversationState: 'ready' }), 'unlock_full_plan')
    assert.equal(getCaseNextStep({ currentCase: makeCase({ entitlement: { status: 'pending', amountCents: 4990, currency: 'CNY' } }), materials: [makeMaterial(true)], conversationState: 'ready' }), 'view_payment_status')
    assert.equal(getCaseNextStep({ currentCase: makeCase({ entitlement: { status: 'paid', amountCents: 4990, currency: 'CNY' } }), materials: [makeMaterial(true)], conversationState: 'ready' }), 'continue_case')
    assert.equal(getCaseNextStep({ currentCase: makeCase({ hasReport: true, entitlement: { status: 'paid', amountCents: 4990, currency: 'CNY' } }), materials: [makeMaterial(true)], conversationState: 'ready' }), 'view_report')
  })

  it('opens materials from the processing summary and reports only after generation', () => {
    assert.deepEqual(clickHomePrimaryAction(makeCase(), 'summary'), ['/pages/materials/index?caseId=case-1'])
    assert.deepEqual(clickHomePrimaryAction(makeCase({ hasReport: true }), 'summary'), ['/pages/report/index?caseId=case-1'])
  })

  it('falls back to viewing an unknown active case rather than creating or charging', () => {
    const action = getCaseNextStep({
      currentCase: makeCase({ nextAction: undefined, status: 'unknown_state' }),
      materials: [makeMaterial(true)],
      conversationState: 'collecting',
    })
    assert.equal(action, 'view_case')
    assert.equal(getHomeStepDetail(action, 1).cta, '查看案件')
  })

  it('routes refunded cases to payment history even when stale actions or reports remain', () => {
    const action = getCaseNextStep({
      currentCase: makeCase({ entitlement: { status: 'refunded', amountCents: 4990, currency: 'CNY' }, nextAction: 'unlock_full_plan', hasReport: true }),
      materials: [makeMaterial(true)], conversationState: 'ready',
    })
    assert.equal(action, 'view_refund_status')
    assert.equal(getHomeStepDetail(action, 1).cta, '查看付费记录')
  })
})
