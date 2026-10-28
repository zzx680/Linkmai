import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const profileSource = readFileSync(path.resolve(__dirname, '../src/pages/profile/index.tsx'), 'utf8')
const caseSource = readFileSync(path.resolve(__dirname, '../src/pages/case/index.tsx'), 'utf8')
const appConfig = readFileSync(path.resolve(__dirname, '../src/app.config.ts'), 'utf8')
const helpSource = readFileSync(path.resolve(__dirname, '../src/pages/help/index.tsx'), 'utf8')

describe('profile support pages', () => {
  it('registers the three support routes and opens each from Profile', () => {
    for (const route of ['pages/help/index', 'pages/privacy/index', 'pages/about/index']) {
      assert.match(appConfig, new RegExp(`'${route}'`))
    }
    assert.match(profileSource, /label: '帮助与反馈', key: 'help'/)
    assert.match(profileSource, /label: '隐私与安全', key: 'privacy'/)
    assert.match(profileSource, /label: '关于灵迈', key: 'about'/)
    assert.match(profileSource, /url: '\/pages\/help\/index'/)
    assert.match(profileSource, /url: '\/pages\/privacy\/index'/)
    assert.match(profileSource, /url: '\/pages\/about\/index'/)
  })

  it('submits feedback before confirming success', () => {
    assert.match(helpSource, /submitFeedback\(content\)/)
    assert.match(helpSource, /反馈已提交/)
    assert.match(helpSource, /setFeedback\(''\)/)
    assert.match(helpSource, /catch \(error\)/)
    assert.match(helpSource, /isSubmitting/)
    assert.doesNotMatch(helpSource, /已收到你的反馈/)
    assert.doesNotMatch(helpSource, /Taro\.request|setStorage|storage/)
  })

  it('uses the shorter retry label', () => {
    assert.match(caseSource, /actionLabel=\{isAuthenticating \? '正在连接微信账户' : authRetryable \? '重新连接并开始' : '微信登录并开始'\}/)
    assert.match(caseSource, /onAction=\{handlePrimaryAction\}/)
    assert.doesNotMatch(caseSource, /重新连接微信账户/)
  })

  it('does not repeat non-interactive help or settings entry points', () => {
    assert.doesNotMatch(helpSource, /quick-help-card|处理事故.*从底部“处理”进入对话/)
    assert.doesNotMatch(profileSource, /profile-header-icon|name="settings"/)
  })
})
