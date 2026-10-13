import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readReportEnvelope } from '../src/services/report-contract'

const report = {
  caseId: 'case-1',
  analysis: 'analysis',
  liability: 'liability',
  compensation: 'compensation',
  recommendations: ['next step'],
  generatedAt: '2026-10-10T00:00:00.000Z'
}

describe('report response contract', () => {
  it('reads the unified POST and GET { report } envelope', () => {
    assert.deepEqual(readReportEnvelope({ report }), report)
  })

  it('does not silently accept the former direct report body', () => {
    assert.equal(readReportEnvelope(report as never), undefined)
  })
})
