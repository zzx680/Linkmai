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

  it('keeps feedback local to the help page', () => {
    assert.match(helpSource, /<Textarea/)
    assert.match(helpSource, /if \(!feedback\.trim\(\)\)/)
    assert.match(helpSource, /已收到你的反馈/)
    assert.match(helpSource, /setFeedback\(''\)/)
    assert.doesNotMatch(helpSource, /services\/api|useAppStore|Taro\.request|setStorage|storage/)
  })

  it('uses the shorter retry label', () => {
    assert.match(caseSource, /authRetryable \? '重新连接' : '微信登录并开始'/)
    assert.doesNotMatch(caseSource, /重新连接微信账户/)
  })
})
