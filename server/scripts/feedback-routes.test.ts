import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import { memoryDB } from '../src/db/memory'
import router from '../src/routes/feedback'

async function request(body: Record<string, unknown> = {}, userId?: string) {
  const layer = (router as any).stack.find((item: any) => item.route?.path === '/' && item.route.methods.post)
  let status = 200
  let payload: any
  const res = { status(code: number) { status = code; return this }, json(value: unknown) { payload = value; return this } }
  await layer.route.stack[0].handle({ body, userId } as express.Request, res, () => undefined)
  return { status, ...payload }
}

test('feedback requires authentication and validates content', async () => {
  assert.equal((await request({ content: '建议' })).status, 401)
  assert.equal((await request({ content: '  ' }, 'missing-user')).status, 400)
  assert.equal((await request({ content: 'x'.repeat(501) }, 'missing-user')).status, 400)
  assert.equal((await request({ content: 123 }, 'missing-user')).status, 400)
})

test('feedback stores trimmed authenticated content', async () => {
  const user = await memoryDB.createUser(`feedback-${Date.now()}-${Math.random()}`)
  const result = await request({ content: '  希望增加材料识别进度提示  ' }, user.id)

  assert.equal(result.status, 201)
  assert.equal(result.success, true)
  assert.equal(typeof result.data.id, 'string')

  const feedback = await memoryDB.getFeedbackByUser(user.id)
  assert.equal(feedback.length, 1)
  assert.equal(feedback[0].id, result.data.id)
  assert.equal(feedback[0].content, '希望增加材料识别进度提示')
  assert.equal(feedback[0].status, 'new')
})
