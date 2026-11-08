import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DB_TYPE = 'memory'
process.env.NODE_ENV = 'test'
process.env.REVIEW_JWT_SECRET = 'review-test-secret-that-is-at-least-32-characters'
process.env.JWT_SECRET = 'user-test-secret-that-is-at-least-32-characters'

const { workflowStore, id } = require('../src/harness/store') as typeof import('../src/harness/store')
const { reviewerLogin } = require('../src/harness/auth') as typeof import('../src/harness/auth')
const bcrypt = require('bcryptjs') as typeof import('bcryptjs')

test('review administrators authenticate by email and invited lawyers by phone', async () => {
  const suffix = id()
  const adminEmail = `admin-${suffix}@example.test`
  const phone = '13800138000'
  const passwordHash = await bcrypt.hash('review-password', 4)
  await workflowStore.control(c => {
    c.reviewers.push(
      { id: id(), email: adminEmail, passwordHash, role: 'review_admin', active: true },
      { id: id(), phone, passwordHash, role: 'reviewer', active: true },
    )
  })

  assert.equal((await reviewerLogin(adminEmail.toUpperCase(), 'review-password')).reviewer.role, 'review_admin')
  assert.equal((await reviewerLogin(phone, 'review-password')).reviewer.role, 'reviewer')
  await assert.rejects(reviewerLogin(adminEmail, 'wrong-password'), /INVALID_REVIEW_CREDENTIALS/)
  await assert.rejects(reviewerLogin('13800138001', 'review-password'), /INVALID_REVIEW_CREDENTIALS/)
})
