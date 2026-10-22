import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ORB_SIZE, startOrbAnimation, workingDots } from '../src/components/ThinkingOrb/engine'

test('orb frames retain bounded finite depth-sorted particles and change with time', () => {
  const frame = workingDots(.6)
  assert.equal(frame.length, 516)
  assert.deepEqual(workingDots(.6), frame)
  assert.notDeepEqual(workingDots(1.6), frame)
  frame.forEach((dot, index) => {
    for (const value of [dot.x, dot.y, dot.z, dot.r, dot.white]) assert.ok(Number.isFinite(value))
    assert.ok(dot.x - dot.r >= 0 && dot.x + dot.r <= ORB_SIZE)
    assert.ok(dot.y - dot.r >= 0 && dot.y + dot.r <= ORB_SIZE)
    assert.ok(dot.r >= .3 && dot.white >= 0 && dot.white <= 1)
    if (index) assert.ok(frame[index - 1].z <= dot.z)
  })
})

test('canvas clock throttles draws and cannot restart from a late frame after cleanup', () => {
  const draws: number[] = [], cancelled: number[] = []
  const scheduled: Array<(time: number) => void> = []
  const stop = startOrbAnimation(time => draws.push(time), callback => scheduled.push(callback), id => cancelled.push(id))
  scheduled[0](0)
  scheduled[1](16)
  scheduled[2](34)
  assert.deepEqual(draws, [.6, 0, .034])
  stop()
  const count = scheduled.length
  scheduled[count - 1](100)
  assert.equal(scheduled.length, count)
  assert.equal(draws.length, 3)
  assert.deepEqual(cancelled, [count])
})

test('reduced motion draws one static frame without scheduling animation', () => {
  const draws: number[] = []
  const stop = startOrbAnimation(time => draws.push(time), () => { throw new Error('No animation expected') }, () => {}, true)
  assert.deepEqual(draws, [.6])
  stop()
})
