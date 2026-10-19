import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Case, Material } from '../src/services/api'
import { getCaseNextStep, getHomeMode, getHomeStepDetail } from '../src/pages/case/home-state'

const casePageSource = readFileSync(path.resolve(__dirname, '../src/pages/case/index.tsx'), 'utf8')
const caseStylesSource = readFileSync(path.resolve(__dirname, '../src/pages/case/index.scss'), 'utf8')

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
  it('distinguishes loading, login, empty and failed case states', () => {
    assert.equal(getHomeMode({ isLoggedIn: true, isLoadingCase: true, caseLoadError: null, currentCase: null }), 'loading')
    assert.equal(getHomeMode({ isLoggedIn: false, isLoadingCase: false, caseLoadError: null, currentCase: null }), 'logged_out')
    assert.equal(getHomeMode({ isLoggedIn: true, isLoadingCase: false, caseLoadError: null, currentCase: null }), 'empty')
    assert.equal(getHomeMode({ isLoggedIn: true, isLoadingCase: false, caseLoadError: 'network', currentCase: makeCase() }), 'load_error')
    assert.equal(getHomeMode({ isLoggedIn: true, isLoadingCase: false, caseLoadError: null, currentCase: makeCase() }), 'case')
  })

  it('places the welcome before the signed-in identity row and journey sections', () => {
    const identityIndex = casePageSource.indexOf('identity-topline')
    const welcomeIndex = casePageSource.indexOf('home-welcome')
    const journeyIndex = casePageSource.indexOf('<CaseJourney')

    assert.ok(welcomeIndex >= 0)
    assert.ok(identityIndex > welcomeIndex)
    assert.ok(journeyIndex > identityIndex)
    assert.match(casePageSource, /Hello👋/)
    assert.match(casePageSource, /欢迎使用灵迈/)
    assert.doesNotMatch(casePageSource, /从一份材料开始整理案件/)
  })

  it('keeps the current journey step visually identifiable', () => {
    assert.match(caseStylesSource, /\.case-page \.journey-step\.current \{[\s\S]*border-color: \$color-brand-primary;[\s\S]*color: \$color-brand-primary;/)
  })

  it('maps collection and confirmation stages to material actions', () => {
    assert.equal(getCaseNextStep({ currentCase: makeCase(), materials: [], conversationState: 'collecting' }), 'continue_materials')
    assert.equal(getCaseNextStep({ currentCase: makeCase({ nextAction: 'confirm_materials' }), materials: [makeMaterial()], conversationState: 'collecting' }), 'confirm_materials')
    assert.equal(getCaseNextStep({ currentCase: makeCase(), materials: [makeMaterial()], conversationState: 'confirming' }), 'confirm_materials')
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
