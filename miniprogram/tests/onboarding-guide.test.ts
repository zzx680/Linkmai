import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeGuide, readGuideProgress } from '../src/components/OnboardingGuide/state'
import { createGuideProgressStore } from '../src/components/OnboardingGuide/progress-store'

test('cached tabs share progress, cannot undo skips, and only explicit restart replays steps', () => {
  let stored: unknown
  const store = createGuideProgressStore(() => stored, value => { stored = value })
  const home: string[][] = [], agent: string[][] = []
  const stop = store.subscribe(value => home.push([...value.seen]))
  store.subscribe(value => agent.push([...value.seen]))
  store.complete(['create-case'])
  store.complete(['describe']) // Leaving a displayed tip consumes it too.
  store.complete(['create-case']) // Stale home tab cannot erase describe.
  assert.deepEqual(store.get().seen, ['create-case', 'describe'])
  assert.deepEqual(home, agent)
  store.skip()
  store.complete(['upload'])
  assert.equal(store.get().skipped, true)
  const reopened = createGuideProgressStore(() => stored, () => {})
  assert.deepEqual(reopened.get(), store.get())
  stop()
  store.restart()
  assert.deepEqual(store.get(), { skipped: false, seen: [] })
  assert.equal(home.at(-1)?.includes('upload'), true)
  assert.deepEqual(agent.at(-1), [])
})

test('storage failures still retain onboarding progress across mounted pages for the session', () => {
  const store = createGuideProgressStore(() => { throw new Error('unavailable') }, () => { throw new Error('full') })
  store.complete(['describe'])
  store.complete(['upload'])
  assert.deepEqual(store.get().seen, ['describe', 'upload'])
})

test('guide progress tolerates stale/corrupt local data and retains explicit skip', () => {
  for (const value of [undefined, null, '', 'bad json', 42]) {
    assert.deepEqual(readGuideProgress(value), { skipped: false, seen: [] })
  }
  assert.deepEqual(readGuideProgress({ skipped: true, seen: ['login', 'unknown', 1, 'upload'] }), {
    skipped: true, seen: ['login', 'upload']
  })
  assert.deepEqual(readGuideProgress({ skipped: 'true', seen: {} }), { skipped: false, seen: [] })
})

test('guide positions both upper login and lower chat targets without clipping on phone sizes', () => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 744 }, { width: 430, height: 850 }]) {
    for (const target of [
      { left: 24, top: 90, width: viewport.width - 48, height: 48 },
      { left: 32, top: viewport.height - 180, width: 112, height: 36 },
      { left: viewport.width - 146, top: viewport.height - 180, width: 112, height: 36 }
    ]) {
      const layout = placeGuide(target, viewport)!
      assert.ok(layout)
      assert.ok(layout.card.left >= 16)
      assert.ok(layout.card.left + layout.card.width <= viewport.width - 16)
      assert.ok(layout.card.top >= 16)
      assert.ok(layout.card.top + layout.card.height <= viewport.height - 16)
      assert.ok(layout.above ? layout.card.top + layout.card.height <= layout.hole.top : layout.card.top >= layout.hole.top + layout.hole.height)
      assert.ok(layout.hole.left <= target.left)
      assert.ok(layout.hole.left + layout.hole.width >= target.left + target.width)
    }
  }
})

test('guide stays out of the way when targets are missing, scrolled out, or viewport is too short', () => {
  const viewport = { width: 390, height: 744 }
  for (const target of [
    { left: 20, top: -30, width: 120, height: 40 },
    { left: 20, top: 720, width: 120, height: 40 },
    { left: 20, top: 400, width: 0, height: 40 },
    { left: 20, top: NaN, width: 120, height: 40 },
    { left: 450, top: 400, width: 120, height: 40 }
  ]) assert.equal(placeGuide(target, viewport), null)
  assert.equal(placeGuide({ left: 20, top: 120, width: 120, height: 40 }, { width: 580, height: 300 }), null)
  assert.equal(placeGuide({ left: 20, top: 220, width: 120, height: 40 }, { width: 320, height: 400 }), null)
  assert.equal(placeGuide({ left: 20, top: 50, width: 120, height: 40 }, { width: 240, height: 568 }), null)
})
