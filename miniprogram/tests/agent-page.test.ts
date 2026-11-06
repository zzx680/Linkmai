import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const pageSource = readFileSync(path.resolve(__dirname, '../src/pages/agent/index.tsx'), 'utf8')

test('案件信息按钮同时控制案件详情和报告准备区域', () => {
  assert.match(pageSource, /aria-expanded=\{isContextExpanded\}/)
  assert.match(pageSource, /currentCase && isContextExpanded && \(\s*<View className="report-readiness-card"/)
  assert.match(pageSource, /isContextExpanded && \(\s*<View className="case-context-panel"/)
})
