import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { getCaseInformation } from '../src/pages/agent/case-information'
import type { Case, CollectedFact, ReportReadiness } from '../src/services/api'

const pageSource = readFileSync(path.resolve(__dirname, '../src/pages/agent/index.tsx'), 'utf8')
const item = { id: 'case-1', title: '新的事故分析' } as Case
const readiness = (missing: ReportReadiness['missing'] = []): ReportReadiness => ({
  confirmed: 0, pending: 0, missing, factsReady: false, canGenerate: false, reportExists: false, reportStale: false
})
const fact = (key: string, value: string, confirmed = true): CollectedFact => ({ key, value, label: key, confirmed })

test('案件信息只展开一个信息面板，移除报告准备与重复材料入口', () => {
  assert.match(pageSource, /aria-expanded=\{isContextExpanded\}/)
  assert.match(pageSource, /setIsContextExpanded\(value => !value\)/)
  assert.match(pageSource, /isContextExpanded && caseInformation &&/)
  assert.match(pageSource, /scrollIntoView=\{isContextExpanded \? 'case-context'/)
  assert.doesNotMatch(pageSource, /report-readiness-card|报告准备|查看并核对材料/)
  assert.match(pageSource, /aria-label="查看材料"/)
})

test('展示真实已收集内容，将待确认信息与缺失信息区分', () => {
  const status = readiness([{ key: 'injury_status', label: '伤情情况' }, { key: 'user_goal', label: '主要诉求' }])
  const info = getCaseInformation(item, [fact('accident_type', 'traffic_accident'), fact('accident_location', '郑州经六路纬三路交叉口'), fact('injury_status', '腿部受伤', false)], status)
  assert.equal(info.confirmed[0].value, '交通事故')
  assert.equal(info.confirmed[1].value, '郑州经六路纬三路交叉口')
  assert.equal(info.pending[0].value, '腿部受伤')
  assert.deepEqual(info.missing, [{ key: 'user_goal', label: '主要诉求' }])
})

test('案件字段仅补充未提供的事实，不覆盖对话中的待确认新值', () => {
  const info = getCaseInformation({ ...item, accidentType: 'traffic_accident', accidentDate: '2026-10-01' }, [fact('accident_date', '2026-10-02', false)], readiness())
  assert.deepEqual(info.confirmed.map(f => f.value), ['交通事故'])
  assert.deepEqual(info.pending.map(f => f.value), ['2026-10-02'])
})

test('待补充项遵循服务端的实际条件，暂不清楚不当成确定事实', () => {
  const status = readiness([{ key: 'property_loss', label: '财产损失' }])
  const info = getCaseInformation(item, [{ ...fact('injury_status', '旧内容'), unknown: true }, fact('empty', '  ')], status)
  assert.equal(info.confirmed[0].value, '暂不清楚')
  assert.deepEqual(info.missing, status.missing)
  assert.equal(info.confirmed.length, 1)
  assert.deepEqual(getCaseInformation(item, [], null), { confirmed: [], pending: [], missing: [] })
})
