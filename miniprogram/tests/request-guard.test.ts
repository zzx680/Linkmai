import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CaseRequestGuard } from '../src/store/request-guard'

describe('CaseRequestGuard', () => {
  it('rejects a response that arrives after switching cases', () => {
    const guard = new CaseRequestGuard()
    const firstCase = guard.activate('case-a')
    const secondCase = guard.activate('case-b')

    assert.equal(guard.isCurrent(firstCase), false)
    assert.equal(guard.isCurrent(secondCase), true)
  })

  it('rejects an older refresh response for the same case', () => {
    const guard = new CaseRequestGuard()
    const oldRefresh = guard.activate('case-a')
    const latestRefresh = guard.activate('case-a')

    assert.equal(guard.isCurrent(oldRefresh), false)
    assert.equal(guard.isCurrent(latestRefresh), true)
  })

  it('invalidates all pending responses on logout or empty case', () => {
    const guard = new CaseRequestGuard()
    const pending = guard.activate('case-a')
    guard.invalidate()

    assert.equal(guard.isCurrent(pending), false)
    assert.equal(guard.getSnapshot().activeCaseId, null)
  })
})
