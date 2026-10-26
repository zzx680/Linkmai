// Run locally or in the intended staging environment with dedicated credentials in env.
import { config } from '../config'
import bcrypt from 'bcryptjs'
import { id, workflowStore } from '../harness/store'
import { pool } from '../db/postgres'
import { reviewerSecret } from '../harness/auth'
async function main() {
  if (config.database.type !== 'postgres') throw new Error('PERSISTENT_DATABASE_REQUIRED')
  reviewerSecret()
  const email = process.env.REVIEW_BOOTSTRAP_EMAIL?.toLowerCase()
  const password = process.env.REVIEW_BOOTSTRAP_PASSWORD
  if (!email || !email.includes('@') || !password || password.length < 12) throw new Error('BOOTSTRAP_CREDENTIALS_REQUIRED')
  const passwordHash = await bcrypt.hash(password, 12)
  await workflowStore.control(c => {
    if (c.reviewers.some(r => r.role === 'review_admin')) throw new Error('ADMIN_ALREADY_BOOTSTRAPPED')
    c.reviewers.push({ id: id(), email, passwordHash, role: 'review_admin', active: true })
  }, 'bootstrap-admin')
  console.log('审核管理员已创建。请清除临时 bootstrap 环境变量。')
}
main().catch(() => { console.error('审核管理员初始化未完成，请检查配置与已有账号。'); process.exitCode = 1 }).finally(() => pool.end())
